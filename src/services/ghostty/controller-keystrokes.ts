import { runAppleScript } from "@raycast/utils";
import { GhosttyController, PaneDirection, SplitDirection } from "./controller";

function escapeAppleScriptText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

class KeystrokeGhosttyController implements GhosttyController {
  async activate(): Promise<void> {
    await runAppleScript('tell application "Ghostty" to activate');
  }

  async newTab(): Promise<void> {
    await runAppleScript(
      'tell application "System Events" to tell process "Ghostty" to keystroke "t" using {command down}',
    );
  }

  async newWindow(): Promise<void> {
    await runAppleScript(
      'tell application "System Events" to tell process "Ghostty" to keystroke "n" using {command down, shift down}',
    );
  }

  async split(direction: SplitDirection): Promise<void> {
    const modifier =
      direction === "horizontal" ? "shift down, command down" : "command down";

    await runAppleScript(
      `tell application "System Events" to tell process "Ghostty" to keystroke "d" using {${modifier}}`,
    );
  }

  async navigate(direction: PaneDirection): Promise<void> {
    const keyCodes: Record<PaneDirection, string> = {
      left: "123",
      right: "124",
      up: "126",
      down: "125",
    };

    await runAppleScript(
      `tell application "System Events" to tell process "Ghostty" to key code ${keyCodes[direction]} using command down`,
    );
  }

  async sendText(text: string): Promise<void> {
    const escaped = escapeAppleScriptText(text);
    await runAppleScript(
      `tell application "System Events" to tell process "Ghostty" to keystroke "${escaped}"`,
      { timeout: 10000 },
    );
  }

  async pressEnter(): Promise<void> {
    await runAppleScript(
      'tell application "System Events" to tell process "Ghostty" to key code 36',
    );
  }

  async getFrontmostAppName(): Promise<string> {
    return runAppleScript(
      'tell application "System Events" to return name of first application process whose frontmost is true',
    );
  }

  async getWindowTitle(): Promise<string> {
    return runAppleScript(
      'tell application "System Events" to tell process "Ghostty" to get title of window 1',
    );
  }

  async getWindowDescription(): Promise<string> {
    return runAppleScript(
      'tell application "System Events" to tell process "Ghostty" to get description of window 1',
    );
  }

  async getWindowName(): Promise<string> {
    return runAppleScript('tell application "Ghostty" to get name of window 1');
  }
}

export const keystrokeGhosttyController: GhosttyController =
  new KeystrokeGhosttyController();
