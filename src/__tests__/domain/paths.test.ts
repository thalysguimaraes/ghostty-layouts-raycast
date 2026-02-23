import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  expandHomePath,
  isDirectory,
  resolveWorkingDirectory,
} from "../../domain/paths";

describe("paths", () => {
  describe("expandHomePath", () => {
    it("expands tilde to user home", () => {
      const result = expandHomePath("~/Developer");
      expect(result.startsWith("~")).toBe(false);
      expect(result.endsWith("/Developer")).toBe(true);
    });

    it("returns same value for non-home paths", () => {
      expect(expandHomePath("/tmp/test")).toBe("/tmp/test");
    });
  });

  describe("resolveWorkingDirectory", () => {
    it("resolves relative pane directory against root", () => {
      const result = resolveWorkingDirectory("./src", "/Users/test/project");
      expect(result).toBe("/Users/test/project/src");
    });

    it("keeps relative pane directory without root", () => {
      const result = resolveWorkingDirectory("./src", undefined);
      expect(result).toBe("./src");
    });

    it("returns expanded root when pane directory is empty", () => {
      const result = resolveWorkingDirectory(undefined, "~/Developer/project");
      expect(result?.startsWith("~")).toBe(false);
      expect(result?.endsWith("/Developer/project")).toBe(true);
    });
  });

  describe("isDirectory", () => {
    it("returns true for existing directory", async () => {
      const folder = await mkdtemp(join(tmpdir(), "ghostty-layouts-"));
      await expect(isDirectory(folder)).resolves.toBe(true);
      await rm(folder, { recursive: true, force: true });
    });

    it("returns false for missing path", async () => {
      await expect(isDirectory("/path/that/does/not/exist")).resolves.toBe(
        false,
      );
    });
  });
});
