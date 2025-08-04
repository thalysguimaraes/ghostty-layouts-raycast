import { exec } from "child_process";
import { promisify } from "util";
import { Split, Pane } from "./types";

const execAsync = promisify(exec);

export type GhosttyTarget = "current" | "new-tab" | "new-window";

export interface GhosttyTabInfo {
  isSingleTab: boolean;
  currentDirectory?: string;
}

export async function isGhosttyRunning(): Promise<boolean> {
  try {
    const result = await execAsync('pgrep -f "Ghostty"');
    return result.stdout.trim().length > 0;
  } catch (error) {
    return false;
  }
}

export async function getCurrentWorkingDirectoryFromShell(): Promise<string | undefined> {
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
      if (windowTitle.includes(':')) {
        const colonIndex = windowTitle.lastIndexOf(':');
        const dirPart = windowTitle.substring(colonIndex + 1).trim();
        if (dirPart.startsWith('/') || dirPart.startsWith('~')) {
          return dirPart.startsWith('~') ? dirPart.replace('~', process.env.HOME || '') : dirPart;
        }
      }
      
      // Pattern: directory path at the end
      const parts = windowTitle.split(/\s+/);
      const lastPart = parts[parts.length - 1];
      if (lastPart && (lastPart.startsWith('/') || lastPart.startsWith('~'))) {
        return lastPart.startsWith('~') ? lastPart.replace('~', process.env.HOME || '') : lastPart;
      }
    }
    
    return undefined;
  } catch (error) {
    console.error("Error getting working directory from shell:", error);
    return undefined;
  }
}

export async function detectCurrentGhosttyTab(): Promise<GhosttyTabInfo> {
  try {
    // Check if Ghostty is running
    const isRunning = await isGhosttyRunning();
    console.log("Ghostty running:", isRunning);
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
      console.log("System Events access denied, trying direct app communication...");
      try {
        // Fallback to direct app communication
        const titleScript = `osascript -e 'tell application "Ghostty" to get name of window 1'`;
        const titleResult = await execAsync(titleScript);
        windowTitle = titleResult.stdout.trim();
      } catch (directError) {
        console.log("Could not get window title, but Ghostty is running");
      }
    }
    
    console.log("Ghostty window title:", windowTitle);
    console.log("Ghostty window subtitle:", windowSubtitle);

    // Extract directory from title or subtitle
    let currentDirectory: string | undefined;
    
    // First, check if subtitle contains working directory (when window-subtitle = working-directory)
    if (windowSubtitle && (windowSubtitle.startsWith('/') || windowSubtitle.startsWith('~'))) {
      currentDirectory = windowSubtitle;
    } else {
      // Fall back to parsing the window title
      
      // Pattern 1: "command - directory" (common in many terminals)
      if (windowTitle.includes(' - ')) {
        const parts = windowTitle.split(' - ');
        currentDirectory = parts[parts.length - 1];
      } 
      // Pattern 2: "user@host:directory" (SSH or local with full path)
      else if (windowTitle.includes(':')) {
        const colonIndex = windowTitle.lastIndexOf(':');
        currentDirectory = windowTitle.substring(colonIndex + 1);
      }
      // Pattern 3: Just the directory name or path
      else if (windowTitle.startsWith('/') || windowTitle.startsWith('~')) {
        currentDirectory = windowTitle;
      }
      // Pattern 4: "directory" at the end after any whitespace
      else {
        const parts = windowTitle.split(/\s+/);
        const lastPart = parts[parts.length - 1];
        if (lastPart && (lastPart.startsWith('/') || lastPart.startsWith('~'))) {
          currentDirectory = lastPart;
        }
      }
    }

    console.log("Detected directory (raw):", currentDirectory);

    // Clean up and expand the directory path
    if (currentDirectory) {
      // Remove any trailing characters that might not be part of the path
      currentDirectory = currentDirectory.replace(/[>\]\)]*$/, '').trim();
      
      // Expand ~ to home directory
      if (currentDirectory.startsWith('~')) {
        currentDirectory = currentDirectory.replace('~', process.env.HOME || '');
      }
    }

    console.log("Detected directory (cleaned):", currentDirectory);

    return {
      isSingleTab: true,
      currentDirectory: currentDirectory
    };
  } catch (error) {
    console.error("Error detecting Ghostty tab:", error);
    return { isSingleTab: false };
  }
}

export async function launchGhostty(target: GhosttyTarget = "new-window") {
  try {
    console.log(`Attempting to launch Ghostty with target: ${target}...`);

    const isRunning = await isGhosttyRunning();
    console.log("Ghostty running status:", isRunning);

    if (target === "current" && isRunning) {
      // Just activate the existing Ghostty window
      await execAsync(
        'osascript -e "tell application \\"Ghostty\\" to activate"',
      );
      await delay(300);
    } else if (target === "new-tab" && isRunning) {
      // Create a new tab
      await execAsync(
        'osascript -e "tell application \\"Ghostty\\" to activate"',
      );
      await delay(300);
      // Ensure we're targeting Ghostty process specifically
      // First ensure Ghostty is truly frontmost
      await ensureGhosttyFrontmost();
      await delay(200);
      // Then send the new tab command
      await execAsync(
        'osascript -e "tell application \\"System Events\\" to tell process \\"Ghostty\\" to keystroke \\"t\\" using {command down}"',
      );
      await delay(500);
    } else {
      // Open new window or launch Ghostty if not running
      if (isRunning) {
        // Ghostty is running, create a new window
        await execAsync(
          'osascript -e "tell application \\"Ghostty\\" to activate"',
        );
        await delay(300);
        // Command+Shift+N for new window in Ghostty
        await execAsync(
          'osascript -e "tell application \\"System Events\\" to tell process \\"Ghostty\\" to keystroke \\"n\\" using {command down, shift down}"',
        );
        await delay(500);
      } else {
        // Ghostty is not running, launch it
        await execAsync("open -a Ghostty");
        await delay(1000);
      }
    }

    // Check what's the frontmost app after launch
    try {
      const frontmostApp = await execAsync(
        'osascript -e "tell application \\"System Events\\" to return name of first application process whose frontmost is true"',
      );
      console.log(
        "Frontmost application after launch:",
        frontmostApp.stdout.trim(),
      );
    } catch (e) {
      console.log("Could not determine frontmost app");
    }

    console.log("Ghostty launched successfully");
  } catch (error) {
    console.error("Failed to launch Ghostty:", error);
    throw new Error(
      "Failed to launch Ghostty. Make sure Ghostty is installed.",
    );
  }
}

export async function createSplit(direction: "vertical" | "horizontal") {
  try {
    console.log(`Creating ${direction} split...`);

    // Ensure Ghostty is frontmost before creating split
    await ensureGhosttyFrontmost();

    // Use osascript to send keystrokes specifically to Ghostty
    // Note: Ghostty creates splits with equal size distribution
    // The 'size' property in layouts is informational only - Ghostty doesn't support programmatic split sizing
    const modifier =
      direction === "horizontal" ? "shift down, command down" : "command down";
    const script = `osascript -e 'tell application "Ghostty" to activate' -e 'tell application "System Events" to tell process "Ghostty" to keystroke "d" using {${modifier}}'`;
    console.log("Executing script:", script);
    const result = await execAsync(script);
    console.log("Split result:", result);
    await delay(200); // Reduced delay for faster split creation
  } catch (error) {
    console.error("Failed to create split:", error);
    throw error;
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
  await delay(100); // Reduced delay
}

export async function runCommand(command: string, workingDirectory?: string) {
  try {
    console.log(
      `Running command: ${command}`,
      workingDirectory ? `in directory: ${workingDirectory}` : "",
    );

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
    console.log("Executing command script:", script);
    const result = await execAsync(script);
    console.log("Command result:", result);
    await delay(300);
  } catch (error) {
    console.error("Failed to run command:", error);
    throw error;
  }
}

export async function createLayoutStructure(
  structure: Split | Pane,
  rootDirectory?: string,
  useCurrentTab: boolean = false,
): Promise<void> {
  // Ensure Ghostty is frontmost before starting
  await ensureGhosttyFrontmost();
  await delay(200);

  if ("command" in structure) {
    // It's a pane
    await runCommand(
      structure.command,
      structure.workingDirectory || rootDirectory,
    );
    await delay(200);
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
    await delay(200);

    // Double-check that Ghostty is frontmost
    const frontmostApp = await execAsync(
      'osascript -e "tell application \\"System Events\\" to return name of first application process whose frontmost is true"',
    );
    const appName = frontmostApp.stdout.trim();

    if (appName.toLowerCase() !== "ghostty") {
      console.warn(
        `Expected Ghostty to be frontmost, but got: ${appName}. Retrying...`,
      );
      await execAsync(
        'osascript -e "tell application \\"Ghostty\\" to activate"',
      );
      await delay(300);
    }
  } catch (error) {
    console.error("Failed to ensure Ghostty is frontmost:", error);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
