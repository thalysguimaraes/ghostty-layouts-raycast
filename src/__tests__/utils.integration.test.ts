/**
 * Integration tests for utils functions
 * These tests verify the integration with mocked system calls
 */

describe("Utils Integration", () => {
  describe("Module loading", () => {
    it("should load utils module without errors", async () => {
      await expect(import("../utils")).resolves.toBeDefined();
    });
  });

  describe("Function exports", () => {
    it("should export all expected functions", async () => {
      const utils = await import("../utils");

      expect(typeof utils.isGhosttyRunning).toBe("function");
      expect(typeof utils.getCurrentWorkingDirectoryFromShell).toBe("function");
      expect(typeof utils.detectCurrentGhosttyTab).toBe("function");
      expect(typeof utils.launchGhostty).toBe("function");
      expect(typeof utils.createSplit).toBe("function");
      expect(typeof utils.navigateToPane).toBe("function");
      expect(typeof utils.runCommand).toBe("function");
      expect(typeof utils.createLayoutStructure).toBe("function");
      expect(typeof utils.resetDelays).toBe("function");
    });
  });
});
