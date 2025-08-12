import { exec } from "child_process";
import { promisify } from "util";
import { Split, Pane } from "./types";
import { ContextualDelay } from "./services/adaptive-delay";
import {
  withRetry,
  withTimeout,
  ScriptExecutionError,
  TimeoutError,
  createErrorHandler,
} from "./services/error-handler";

const execAsync = promisify(exec);
const adaptiveDelay = new ContextualDelay(200, 100, 1000);
const handleError = createErrorHandler("Ghostty Utils");

export type GhosttyTarget = "current" | "new-tab" | "new-window";

export interface GhosttyTabInfo {
  isSingleTab: boolean;
  currentDirectory?: string;
}

export async function isGhosttyRunning(): Promise<boolean> {
  try {
    const result = await withTimeout(
      execAsync('pgrep -f "Ghostty"'),
      3000,
      "Timeout checking if Ghostty is running",
    );
    return result.stdout.trim().length > 0;
  } catch (error) {
    return false;
  }
}

export async function getCurrentWorkingDirectoryFromShell(): Promise<
  string | undefined
> {
  try {
    // Use AppleScript to get current working directory via shell prompt integration
    // This works by checking if the shell has updated the window title with directory info
    const script = `
      osascript -e '
        tell application "System Events"
          tell process "Ghostty"
            try
              -- Try to get the window title which might contain directory info
              set windowTitle to title of window 1
              return windowTitle
            on error
              return ""
            end try
          end tell
        end tell
      '
    `;

    const result = await execAsync(script);
    const windowTitle = result.stdout.trim();

    // Parse the window title for directory information
    if (windowTitle) {
      // Look for common shell prompt patterns that include directory
      // Pattern: "user@host:directory"
      if (windowTitle.includes(":")) {
        const colonIndex = windowTitle.lastIndexOf(":");
        const dirPart = windowTitle.substring(colonIndex + 1).trim();
        if (dirPart.startsWith("/") || dirPart.startsWith("~")) {
          return dirPart.startsWith("~")
            ? dirPart.replace("~", process.env.HOME || "")
            : dirPart;
        }
      }

      // Pattern: directory path at the end
      const parts = windowTitle.split(/\s+/);
      const lastPart = parts[parts.length - 1];
      if (lastPart && (lastPart.startsWith("/") || lastPart.startsWith("~"))) {
        return lastPart.startsWith("~")
          ? lastPart.replace("~", process.env.HOME || "")
          : lastPart;
      }
    }

    return undefined;
  } catch (error) {
    // Error getting working directory from shell
    return undefined;
  }
}

export async function detectCurrentGhosttyTab(): Promise<GhosttyTabInfo> {
  try {
    // Check if Ghostty is running
    const isRunning = await isGhosttyRunning();
    if (!isRunning) {
      return { isSingleTab: false };
    }

    // Get window title and subtitle for directory detection
    let windowTitle = "";
    let windowSubtitle = "";

    try {
      // First try System Events (requires accessibility)
      const titleScript = `osascript -e 'tell application "System Events" to tell process "Ghostty" to get title of window 1'`;
      const titleResult = await execAsync(titleScript);
      windowTitle = titleResult.stdout.trim();

      // Also try to get subtitle (which might contain working directory)
      const subtitleScript = `osascript -e 'tell application "System Events" to tell process "Ghostty" to get description of window 1'`;
      try {
        const subtitleResult = await execAsync(subtitleScript);
        windowSubtitle = subtitleResult.stdout.trim();
      } catch (subtitleError) {
        // Subtitle might not be available
      }
    } catch (systemEventsError) {
      // System Events access denied, trying direct app communication
      try {
        // Fallback to direct app communication
        const titleScript = `osascript -e 'tell application "Ghostty" to get name of window 1'`;
        const titleResult = await execAsync(titleScript);
        windowTitle = titleResult.stdout.trim();
      } catch (directError) {
        // Could not get window title, but Ghostty is running
      }
    }

    // Extract directory from title or subtitle
    let currentDirectory: string | undefined;

    // First, check if subtitle contains working directory (when window-subtitle = working-directory)
    if (
      windowSubtitle &&
      (windowSubtitle.startsWith("/") || windowSubtitle.startsWith("~"))
    ) {
      currentDirectory = windowSubtitle;
    } else {
      // Fall back to parsing the window title

      // Pattern 1: "command - directory" (common in many terminals)
      if (windowTitle.includes(" - ")) {
        const parts = windowTitle.split(" - ");
        currentDirectory = parts[parts.length - 1];
      }
      // Pattern 2: "user@host:directory" (SSH or local with full path)
      else if (windowTitle.includes(":")) {
        const colonIndex = windowTitle.lastIndexOf(":");
        currentDirectory = windowTitle.substring(colonIndex + 1);
      }
      // Pattern 3: Just the directory name or path
      else if (windowTitle.startsWith("/") || windowTitle.startsWith("~")) {
        currentDirectory = windowTitle;
      }
      // Pattern 4: "directory" at the end after any whitespace
      else {
        const parts = windowTitle.split(/\s+/);
        const lastPart = parts[parts.length - 1];
        if (
          lastPart &&
          (lastPart.startsWith("/") || lastPart.startsWith("~"))
        ) {
          currentDirectory = lastPart;
        }
      }
    }

    // Clean up and expand the directory path
    if (currentDirectory) {
      // Remove any trailing characters that might not be part of the path
      currentDirectory = currentDirectory.replace(/[>\])]*$/, "").trim();

      // Expand ~ to home directory
      if (currentDirectory.startsWith("~")) {
        currentDirectory = currentDirectory.replace(
          "~",
          process.env.HOME || "",
        );
      }
    }

    return {
      isSingleTab: true,
      currentDirectory: currentDirectory,
    };
  } catch (error) {
    // Error detecting Ghostty tab
    return { isSingleTab: false };
  }
}

export async function launchGhostty(target: GhosttyTarget = "new-window") {
  try {
    const isRunning = await isGhosttyRunning();

    if (target === "current" && isRunning) {
      // Just activate the existing Ghostty window
      await execAsync(
        'osascript -e "tell application \\"Ghostty\\" to activate"',
      );
      await adaptiveDelay.wait("activation");
      adaptiveDelay.recordSuccess("activation");
    } else if (target === "new-tab" && isRunning) {
      // Create a new tab
      await execAsync(
        'osascript -e "tell application \\"Ghostty\\" to activate"',
      );
      await adaptiveDelay.wait("activation");
      adaptiveDelay.recordSuccess("activation");
      // Ensure we're targeting Ghostty process specifically
      // First ensure Ghostty is truly frontmost
      await ensureGhosttyFrontmost();
      await adaptiveDelay.wait("frontmost");
      // Then send the new tab command
      await execAsync(
        'osascript -e "tell application \\"System Events\\" to tell process \\"Ghostty\\" to keystroke \\"t\\" using {command down}"',
      );
      await adaptiveDelay.wait("new-tab");
      adaptiveDelay.recordSuccess("new-tab");
    } else {
      // Open new window or launch Ghostty if not running
      if (isRunning) {
        // Ghostty is running, create a new window
        await execAsync(
          'osascript -e "tell application \\"Ghostty\\" to activate"',
        );
        await adaptiveDelay.wait("activation");
        adaptiveDelay.recordSuccess("activation");
        // Command+Shift+N for new window in Ghostty
        await execAsync(
          'osascript -e "tell application \\"System Events\\" to tell process \\"Ghostty\\" to keystroke \\"n\\" using {command down, shift down}"',
        );
        await adaptiveDelay.wait("new-window");
        adaptiveDelay.recordSuccess("new-window");
      } else {
        // Ghostty is not running, launch it
        await execAsync("open -a Ghostty");
        await adaptiveDelay.wait("launch");
        adaptiveDelay.recordSuccess("launch");
      }
    }

    // Check what's the frontmost app after launch
    try {
      await execAsync(
        'osascript -e "tell application \\"System Events\\" to return name of first application process whose frontmost is true"',
      );
    } catch (e) {
      // Could not determine frontmost app
    }
  } catch (error) {
    // Failed to launch Ghostty
    throw new Error(
      "Failed to launch Ghostty. Make sure Ghostty is installed.",
    );
  }
}

export async function createSplit(direction: "vertical" | "horizontal") {
  try {
    // Ensure Ghostty is frontmost before creating split
    await ensureGhosttyFrontmost();

    // Use osascript to send keystrokes specifically to Ghostty
    // Note: Ghostty creates splits with equal size distribution
    // The 'size' property in layouts is informational only - Ghostty doesn't support programmatic split sizing
    const modifier =
      direction === "horizontal" ? "shift down, command down" : "command down";
    const script = `osascript -e 'tell application "Ghostty" to activate' -e 'tell application "System Events" to tell process "Ghostty" to keystroke "d" using {${modifier}}'`;

    await withRetry(
      () => withTimeout(execAsync(script), 5000, "Split creation timed out"),
      {
        maxRetries: 2,
        retryDelay: 500,
        onRetry: () => {
          // Retrying split creation
          adaptiveDelay.recordFailure("split");
        },
      },
    );

    await adaptiveDelay.wait("split");
    adaptiveDelay.recordSuccess("split");
  } catch (error) {
    // Failed to create split
    throw new ScriptExecutionError(
      "Failed to create split",
      error,
      undefined,
      2,
    );
  }
}

export async function navigateToPane(
  direction: "left" | "right" | "up" | "down",
) {
  const keyCodes = {
    left: "123",
    right: "124",
    up: "126",
    down: "125",
  };

  // Ensure Ghostty is frontmost before navigating
  await ensureGhosttyFrontmost();

  await execAsync(
    `osascript -e 'tell application "Ghostty" to activate' -e 'tell application "System Events" to tell process "Ghostty" to key code ${keyCodes[direction]} using command down'`,
  );
  await adaptiveDelay.wait("navigate");
  adaptiveDelay.recordSuccess("navigate");
}

export async function runCommand(command: string, workingDirectory?: string) {
  try {
    // Ensure Ghostty is frontmost before sending commands
    await ensureGhosttyFrontmost();

    let fullCommand = command;

    if (workingDirectory) {
      // Expand tilde to home directory
      const expandedDir = workingDirectory.replace(
        /^~/,
        process.env.HOME || "",
      );
      fullCommand = `cd "${expandedDir}" && ${command}`;
    }

    // Escape the command properly
    const escapedCommand = fullCommand
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');

    // Send the command
    const script = `osascript -e 'tell application "Ghostty" to activate' -e 'delay 0.2' -e 'tell application "System Events" to tell process "Ghostty" to keystroke "${escapedCommand}"' -e 'delay 0.1' -e 'tell application "System Events" to tell process "Ghostty" to key code 36'`;

    await withRetry(
      () =>
        withTimeout(execAsync(script), 10000, "Command execution timed out"),
      {
        maxRetries: 2,
        retryDelay: 1000,
        onRetry: () => {
          // Retrying command execution
          adaptiveDelay.recordFailure("command");
        },
        shouldRetry: (error) => {
          // Don't retry if it's a timeout error with a long-running command
          if (
            error instanceof TimeoutError &&
            command.includes("npm install")
          ) {
            return false;
          }
          return true;
        },
      },
    );

    await adaptiveDelay.wait("command");
    adaptiveDelay.recordSuccess("command");
  } catch (error) {
    handleError(error);
    // Failed to run command
    throw new ScriptExecutionError(
      `Failed to run command: ${command}`,
      error,
      undefined,
      2,
    );
  }
}

export async function createLayoutStructure(
  structure: Split | Pane,
  rootDirectory?: string,
  useCurrentTab: boolean = false,
): Promise<void> {
  // Ensure Ghostty is frontmost before starting
  await ensureGhosttyFrontmost();
  await adaptiveDelay.wait("structure-start");
  adaptiveDelay.recordSuccess("structure-start");

  if ("command" in structure) {
    // It's a pane
    await runCommand(
      structure.command,
      structure.workingDirectory || rootDirectory,
    );
    await adaptiveDelay.wait("pane-command");
    adaptiveDelay.recordSuccess("pane-command");
  } else {
    // It's a split
    const { direction, panes } = structure;

    for (let i = 0; i < panes.length; i++) {
      // For current tab usage: use the existing tab for the first pane, create splits for others
      if (i > 0 || !useCurrentTab) {
        if (i > 0) {
          await createSplit(direction);

          // Navigate to the new pane
          if (direction === "vertical") {
            await navigateToPane("right");
          } else {
            await navigateToPane("down");
          }
        }
      }

      const pane = panes[i];

      if ("direction" in pane) {
        // Nested split
        await createLayoutStructure(pane, rootDirectory, false); // Don't use current tab for nested splits
      } else {
        // Simple pane
        await runCommand(pane.command, pane.workingDirectory || rootDirectory);
      }
    }

    // Navigate back to first pane
    for (let i = 1; i < panes.length; i++) {
      if (direction === "vertical") {
        await navigateToPane("left");
      } else {
        await navigateToPane("up");
      }
    }
  }
}

async function ensureGhosttyFrontmost(): Promise<void> {
  try {
    // Activate Ghostty and ensure it's frontmost
    await execAsync(
      'osascript -e "tell application \\"Ghostty\\" to activate"',
    );
    await adaptiveDelay.wait("frontmost");
    adaptiveDelay.recordSuccess("frontmost");

    // Double-check that Ghostty is frontmost
    const frontmostApp = await execAsync(
      'osascript -e "tell application \\"System Events\\" to return name of first application process whose frontmost is true"',
    );
    const appName = frontmostApp.stdout.trim();

    if (appName.toLowerCase() !== "ghostty") {
      // Expected Ghostty to be frontmost, retrying
      await execAsync(
        'osascript -e "tell application \\"Ghostty\\" to activate"',
      );
      await adaptiveDelay.wait("retry-frontmost");
      adaptiveDelay.recordSuccess("retry-frontmost");
    }
  } catch (error) {
    // Failed to ensure Ghostty is frontmost
  }
}

export function resetDelays(): void {
  adaptiveDelay.resetAll();
}
