// Mock the modules before importing anything
jest.mock("child_process");
jest.mock("util", () => ({
  promisify: jest.fn(() => jest.fn()),
}));

import { promisify } from "util";
import {
  isGhosttyRunning,
  getCurrentWorkingDirectoryFromShell,
  detectCurrentGhosttyTab,
  launchGhostty,
  createSplit,
  navigateToPane,
  runCommand,
  resetDelays,
} from "../utils";

// Mock the services
jest.mock("../services/adaptive-delay", () => ({
  AdaptiveDelay: jest.fn().mockImplementation(() => ({
    wait: jest.fn().mockResolvedValue(undefined),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
    reset: jest.fn(),
    getStats: jest.fn().mockReturnValue({
      currentDelay: 100,
      successCount: 0,
      failureCount: 0,
      averageDelay: 100,
    }),
  })),
  ContextualDelay: jest.fn().mockImplementation(() => ({
    wait: jest.fn().mockResolvedValue(undefined),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
    resetAll: jest.fn(),
    getStats: jest.fn().mockReturnValue({
      currentDelay: 100,
      successCount: 0,
      failureCount: 0,
      averageDelay: 100,
    }),
  })),
}));

jest.mock("../services/error-handler", () => ({
  withRetry: jest.fn((fn) => fn()),
  withTimeout: jest.fn((promise) => promise),
  ScriptExecutionError: Error,
  TimeoutError: Error,
  createErrorHandler: jest.fn(() => jest.fn((error) => error)),
}));

describe("Utils", () => {
  let mockExecAsync: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecAsync = jest.fn();
    (promisify as unknown as jest.Mock).mockReturnValue(mockExecAsync);
  });

  describe("isGhosttyRunning", () => {
    it("should return true when Ghostty is running", async () => {
      mockExecAsync.mockResolvedValue({ stdout: "12345\n", stderr: "" });

      const result = await isGhosttyRunning();

      expect(result).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith('pgrep -f "Ghostty"');
    });

    it("should return false when Ghostty is not running", async () => {
      mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });

      const result = await isGhosttyRunning();

      expect(result).toBe(false);
    });

    it("should return false on error", async () => {
      mockExecAsync.mockRejectedValue(new Error("pgrep failed"));

      const result = await isGhosttyRunning();

      expect(result).toBe(false);
    });
  });

  describe("getCurrentWorkingDirectoryFromShell", () => {
    it("should parse directory from window title with colon pattern", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "user@host:/Users/test/project\n",
        stderr: "",
      });

      const result = await getCurrentWorkingDirectoryFromShell();

      expect(result).toBe("/Users/test/project");
    });

    it("should expand tilde to home directory", async () => {
      process.env.HOME = "/Users/test";
      mockExecAsync.mockResolvedValue({
        stdout: "~/Developer\n",
        stderr: "",
      });

      const result = await getCurrentWorkingDirectoryFromShell();

      expect(result).toBe("/Users/test/Developer");
    });

    it("should return undefined when no directory found", async () => {
      mockExecAsync.mockResolvedValue({
        stdout: "Some Random Title\n",
        stderr: "",
      });

      const result = await getCurrentWorkingDirectoryFromShell();

      expect(result).toBeUndefined();
    });

    it("should handle errors gracefully", async () => {
      mockExecAsync.mockRejectedValue(new Error("AppleScript failed"));

      const result = await getCurrentWorkingDirectoryFromShell();

      expect(result).toBeUndefined();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("detectCurrentGhosttyTab", () => {
    it("should detect single tab with directory", async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "12345\n", stderr: "" }) // isGhosttyRunning
        .mockResolvedValueOnce({
          stdout: "Ghostty - /Users/test\n",
          stderr: "",
        }) // window title
        .mockRejectedValueOnce(new Error("No subtitle")); // subtitle (optional)

      const result = await detectCurrentGhosttyTab();

      expect(result.isSingleTab).toBe(true);
      expect(result.currentDirectory).toBe("/Users/test");
    });

    it("should return false when Ghostty is not running", async () => {
      mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });

      const result = await detectCurrentGhosttyTab();

      expect(result.isSingleTab).toBe(false);
      expect(result.currentDirectory).toBeUndefined();
    });

    it("should handle errors and return false", async () => {
      mockExecAsync.mockRejectedValue(new Error("Failed"));

      const result = await detectCurrentGhosttyTab();

      expect(result.isSingleTab).toBe(false);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("launchGhostty", () => {
    it("should activate existing window for current target", async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "12345\n", stderr: "" }) // isGhosttyRunning
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // activate
        .mockResolvedValueOnce({ stdout: "Ghostty\n", stderr: "" }); // frontmost check

      await launchGhostty("current");

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('tell application \\"Ghostty\\" to activate'),
      );
    });

    it("should create new tab when running", async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "12345\n", stderr: "" }) // isGhosttyRunning
        .mockResolvedValue({ stdout: "", stderr: "" }); // Various AppleScript calls

      await launchGhostty("new-tab");

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('keystroke \\"t\\" using {command down}'),
      );
    });

    it("should create new window when running", async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "12345\n", stderr: "" }) // isGhosttyRunning
        .mockResolvedValue({ stdout: "", stderr: "" }); // Various AppleScript calls

      await launchGhostty("new-window");

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining(
          'keystroke \\"n\\" using {command down, shift down}',
        ),
      );
    });

    it("should launch Ghostty if not running", async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: "", stderr: "" }) // isGhosttyRunning returns false
        .mockResolvedValue({ stdout: "", stderr: "" }); // open -a Ghostty

      await launchGhostty("new-window");

      expect(mockExecAsync).toHaveBeenCalledWith("open -a Ghostty");
    });

    it("should throw error on failure", async () => {
      mockExecAsync.mockRejectedValue(new Error("Launch failed"));

      await expect(launchGhostty()).rejects.toThrow(
        "Failed to launch Ghostty. Make sure Ghostty is installed.",
      );
    });
  });

  describe("createSplit", () => {
    it("should create vertical split", async () => {
      mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });

      await createSplit("vertical");

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('keystroke "d" using {command down}'),
      );
    });

    it("should create horizontal split", async () => {
      mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });

      await createSplit("horizontal");

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining(
          'keystroke "d" using {shift down, command down}',
        ),
      );
    });

    it("should handle errors", async () => {
      mockExecAsync.mockRejectedValue(new Error("Split failed"));

      await expect(createSplit("vertical")).rejects.toThrow(
        "Failed to create split",
      );
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("navigateToPane", () => {
    const keyCodes = {
      left: "123",
      right: "124",
      up: "126",
      down: "125",
    };

    it.each(["left", "right", "up", "down"] as const)(
      "should navigate %s",
      async (direction) => {
        mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });

        await navigateToPane(direction);

        expect(mockExecAsync).toHaveBeenCalledWith(
          expect.stringContaining(`key code ${keyCodes[direction]}`),
        );
      },
    );
  });

  describe("runCommand", () => {
    it("should run command without working directory", async () => {
      mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });

      await runCommand("ls -la");

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('keystroke "ls -la"'),
      );
    });

    it("should run command with working directory", async () => {
      mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });
      process.env.HOME = "/Users/test";

      await runCommand("npm start", "~/Developer/project");

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining(
          'cd \\"/Users/test/Developer/project\\" && npm start',
        ),
      );
    });

    it("should escape special characters", async () => {
      mockExecAsync.mockResolvedValue({ stdout: "", stderr: "" });

      await runCommand('echo "Hello \\ World"');

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('echo \\\\\\"Hello \\\\\\\\ World\\\\\\"'),
      );
    });

    it("should handle errors", async () => {
      mockExecAsync.mockRejectedValue(new Error("Command failed"));

      await expect(runCommand("failing-command")).rejects.toThrow(
        "Failed to run command: failing-command",
      );
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("resetDelays", () => {
    it("should reset all delays", async () => {
      const adaptiveDelayModule = await import("../services/adaptive-delay");
      const { ContextualDelay } = adaptiveDelayModule;
      const instance = new ContextualDelay();

      resetDelays();

      expect(instance.resetAll).toHaveBeenCalled();
    });
  });
});
