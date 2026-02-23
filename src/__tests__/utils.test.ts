const mockExecAsync = jest.fn();

const mockAdaptiveDelay = {
  wait: jest.fn().mockResolvedValue(undefined),
  recordSuccess: jest.fn(),
  recordFailure: jest.fn(),
  resetAll: jest.fn(),
};

const mockGhosttyController = {
  activate: jest.fn().mockResolvedValue(undefined),
  newTab: jest.fn().mockResolvedValue(undefined),
  newWindow: jest.fn().mockResolvedValue(undefined),
  split: jest.fn().mockResolvedValue(undefined),
  navigate: jest.fn().mockResolvedValue(undefined),
  sendText: jest.fn().mockResolvedValue(undefined),
  pressEnter: jest.fn().mockResolvedValue(undefined),
  getFrontmostAppName: jest.fn().mockResolvedValue("Ghostty"),
  getWindowTitle: jest.fn().mockResolvedValue(""),
  getWindowDescription: jest.fn().mockResolvedValue(""),
  getWindowName: jest.fn().mockResolvedValue(""),
};

jest.mock("child_process");
jest.mock("util", () => ({
  promisify: jest.fn(() => mockExecAsync),
}));

jest.mock("../services/adaptive-delay", () => ({
  ContextualDelay: jest.fn(() => mockAdaptiveDelay),
}));

jest.mock("../services/error-handler", () => ({
  withRetry: jest.fn((fn) => fn()),
  withTimeout: jest.fn((promise) => promise),
  ScriptExecutionError: class ScriptExecutionError extends Error {},
  TimeoutError: class TimeoutError extends Error {},
  createErrorHandler: jest.fn(() => jest.fn((error) => error)),
}));

jest.mock("../services/ghostty/controller-keystrokes", () => ({
  keystrokeGhosttyController: mockGhosttyController,
}));

import {
  createSplit,
  detectCurrentGhosttyTab,
  getCurrentWorkingDirectoryFromShell,
  isGhosttyRunning,
  launchGhostty,
  navigateToPane,
  resetDelays,
  runCommand,
} from "../utils";

describe("utils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });

    mockGhosttyController.activate.mockResolvedValue(undefined);
    mockGhosttyController.newTab.mockResolvedValue(undefined);
    mockGhosttyController.newWindow.mockResolvedValue(undefined);
    mockGhosttyController.split.mockResolvedValue(undefined);
    mockGhosttyController.navigate.mockResolvedValue(undefined);
    mockGhosttyController.sendText.mockResolvedValue(undefined);
    mockGhosttyController.pressEnter.mockResolvedValue(undefined);
    mockGhosttyController.getFrontmostAppName.mockResolvedValue("Ghostty");
    mockGhosttyController.getWindowTitle.mockResolvedValue("");
    mockGhosttyController.getWindowDescription.mockResolvedValue("");
    mockGhosttyController.getWindowName.mockResolvedValue("");
  });

  describe("isGhosttyRunning", () => {
    it("returns true when pgrep finds Ghostty", async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: "12345\n", stderr: "" });

      await expect(isGhosttyRunning()).resolves.toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith('pgrep -f "Ghostty"');
    });

    it("returns false when pgrep returns empty output", async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

      await expect(isGhosttyRunning()).resolves.toBe(false);
    });

    it("returns false when pgrep fails", async () => {
      mockExecAsync.mockRejectedValueOnce(new Error("pgrep failed"));

      await expect(isGhosttyRunning()).resolves.toBe(false);
    });
  });

  describe("getCurrentWorkingDirectoryFromShell", () => {
    it("parses path from title with colon format", async () => {
      mockGhosttyController.getWindowTitle.mockResolvedValueOnce(
        "user@host:/Users/test/project",
      );

      await expect(getCurrentWorkingDirectoryFromShell()).resolves.toBe(
        "/Users/test/project",
      );
    });

    it("expands home when title contains tilde", async () => {
      process.env.HOME = "/Users/test";
      mockGhosttyController.getWindowTitle.mockResolvedValueOnce("~/Developer");

      await expect(getCurrentWorkingDirectoryFromShell()).resolves.toBe(
        "/Users/test/Developer",
      );
    });

    it("returns undefined when title has no path", async () => {
      mockGhosttyController.getWindowTitle.mockResolvedValueOnce(
        "Ghostty Terminal",
      );

      await expect(
        getCurrentWorkingDirectoryFromShell(),
      ).resolves.toBeUndefined();
    });

    it("returns undefined on controller errors", async () => {
      mockGhosttyController.getWindowTitle.mockRejectedValueOnce(
        new Error("denied"),
      );

      await expect(
        getCurrentWorkingDirectoryFromShell(),
      ).resolves.toBeUndefined();
    });
  });

  describe("detectCurrentGhosttyTab", () => {
    it("returns directory from subtitle when available", async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: "123\n", stderr: "" });
      mockGhosttyController.getWindowTitle.mockResolvedValueOnce("Ghostty");
      mockGhosttyController.getWindowDescription.mockResolvedValueOnce(
        "/Users/test/repo",
      );

      await expect(detectCurrentGhosttyTab()).resolves.toEqual({
        isSingleTab: true,
        currentDirectory: "/Users/test/repo",
      });
    });

    it("returns false when Ghostty is not running", async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

      await expect(detectCurrentGhosttyTab()).resolves.toEqual({
        isSingleTab: false,
      });
    });

    it("falls back to window name when title access fails", async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: "123\n", stderr: "" });
      mockGhosttyController.getWindowTitle.mockRejectedValueOnce(
        new Error("no accessibility"),
      );
      mockGhosttyController.getWindowName.mockResolvedValueOnce(
        "Ghostty - /Users/test/window",
      );

      await expect(detectCurrentGhosttyTab()).resolves.toEqual({
        isSingleTab: true,
        currentDirectory: "/Users/test/window",
      });
    });
  });

  describe("launchGhostty", () => {
    it("activates current window when target is current", async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: "123\n", stderr: "" });

      await launchGhostty("current");

      expect(mockGhosttyController.activate).toHaveBeenCalled();
      expect(mockGhosttyController.newTab).not.toHaveBeenCalled();
    });

    it("creates new tab when target is new-tab", async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: "123\n", stderr: "" });

      await launchGhostty("new-tab");

      expect(mockGhosttyController.newTab).toHaveBeenCalled();
    });

    it("creates new window when running and target is new-window", async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: "123\n", stderr: "" });

      await launchGhostty("new-window");

      expect(mockGhosttyController.newWindow).toHaveBeenCalled();
    });

    it("opens Ghostty app when not running", async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

      await launchGhostty("new-window");

      expect(mockExecAsync).toHaveBeenCalledWith("open -a Ghostty");
    });

    it("throws when controller activation fails", async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: "123\n", stderr: "" });
      mockGhosttyController.activate.mockRejectedValueOnce(new Error("boom"));

      await expect(launchGhostty("current")).rejects.toThrow(
        "Failed to launch Ghostty. Make sure Ghostty is installed.",
      );
    });
  });

  describe("createSplit", () => {
    it("creates vertical split", async () => {
      await createSplit("vertical");

      expect(mockGhosttyController.split).toHaveBeenCalledWith("vertical");
    });

    it("creates horizontal split", async () => {
      await createSplit("horizontal");

      expect(mockGhosttyController.split).toHaveBeenCalledWith("horizontal");
    });

    it("throws when split command fails", async () => {
      mockGhosttyController.split.mockRejectedValueOnce(
        new Error("split fail"),
      );

      await expect(createSplit("vertical")).rejects.toThrow(
        "Failed to create split",
      );
    });
  });

  describe("navigateToPane", () => {
    it.each(["left", "right", "up", "down"] as const)(
      "navigates %s",
      async (direction) => {
        await navigateToPane(direction);

        expect(mockGhosttyController.navigate).toHaveBeenCalledWith(direction);
      },
    );
  });

  describe("runCommand", () => {
    it("sends command text and presses enter", async () => {
      await runCommand("ls -la");

      expect(mockGhosttyController.sendText).toHaveBeenCalledWith("ls -la");
      expect(mockGhosttyController.pressEnter).toHaveBeenCalled();
    });

    it("prepends directory change when working directory is provided", async () => {
      process.env.HOME = "/Users/test";

      await runCommand("npm start", "~/Developer/project");

      expect(mockGhosttyController.sendText).toHaveBeenCalledWith(
        'cd "/Users/test/Developer/project" && npm start',
      );
    });

    it("throws when sending text fails", async () => {
      mockGhosttyController.sendText.mockRejectedValueOnce(
        new Error("send failed"),
      );

      await expect(runCommand("npm start")).rejects.toThrow(
        "Failed to run command: npm start",
      );
    });
  });

  describe("resetDelays", () => {
    it("resets contextual delays", () => {
      resetDelays();

      expect(mockAdaptiveDelay.resetAll).toHaveBeenCalled();
    });
  });
});
