import { exec } from "child_process";
import { promisify } from "util";
import { Split, Pane } from "./types";

const execAsync = promisify(exec);

export type GhosttyTarget = "current" | "new-tab" | "new-window";

export async function isGhosttyRunning(): Promise<boolean> {
  try {
    const result = await execAsync('pgrep -f "Ghostty"');
    return result.stdout.trim().length > 0;
  } catch (error) {
    return false;
  }
}

export async function launchGhostty(target: GhosttyTarget = "new-window") {
  try {
    console.log(`Attempting to launch Ghostty with target: ${target}...`);
    
    const isRunning = await isGhosttyRunning();
    console.log("Ghostty running status:", isRunning);
    
    if (target === "current" && isRunning) {
      // Just activate the existing Ghostty window
      await execAsync('osascript -e "tell application \\"Ghostty\\" to activate"');
      await delay(800);
    } else if (target === "new-tab" && isRunning) {
      // Create a new tab
      await execAsync('osascript -e "tell application \\"Ghostty\\" to activate"');
      await delay(800);
      // Ensure we're targeting Ghostty process specifically
      // First ensure Ghostty is truly frontmost
      await ensureGhosttyFrontmost();
      await delay(300);
      // Then send the new tab command
      await execAsync('osascript -e "tell application \\"System Events\\" to tell process \\"Ghostty\\" to keystroke \\"t\\" using {command down}"');
      await delay(1500);
    } else {
      // Open new window or launch Ghostty if not running
      if (isRunning) {
        // Ghostty is running, create a new window
        await execAsync('osascript -e "tell application \\"Ghostty\\" to activate"');
        await delay(500);
        // Command+Shift+N for new window in Ghostty
        await execAsync('osascript -e "tell application \\"System Events\\" to tell process \\"Ghostty\\" to keystroke \\"n\\" using {command down, shift down}"');
        await delay(1000);
      } else {
        // Ghostty is not running, launch it
        await execAsync('open -a Ghostty');
        await delay(2000);
      }
    }
    
    // Check what's the frontmost app after launch
    try {
      const frontmostApp = await execAsync('osascript -e "tell application \\"System Events\\" to return name of first application process whose frontmost is true"');
      console.log("Frontmost application after launch:", frontmostApp.stdout.trim());
    } catch (e) {
      console.log("Could not determine frontmost app");
    }
    
    console.log("Ghostty launched successfully");
  } catch (error) {
    console.error("Failed to launch Ghostty:", error);
    throw new Error("Failed to launch Ghostty. Make sure Ghostty is installed.");
  }
}

export async function createSplit(direction: "vertical" | "horizontal") {
  try {
    console.log(`Creating ${direction} split...`);
    
    // Ensure Ghostty is frontmost before creating split
    await ensureGhosttyFrontmost();
    
    // Use osascript to send keystrokes specifically to Ghostty
    const modifier = direction === "horizontal" ? "shift down, command down" : "command down";
    const script = `osascript -e 'tell application "Ghostty" to activate' -e 'tell application "System Events" to tell process "Ghostty" to keystroke "d" using {${modifier}}'`;
    console.log("Executing script:", script);
    const result = await execAsync(script);
    console.log("Split result:", result);
    await delay(500); // Increased delay for split creation
  } catch (error) {
    console.error("Failed to create split:", error);
    throw error;
  }
}

export async function navigateToPane(direction: "left" | "right" | "up" | "down") {
  const keyCodes = {
    left: "123",
    right: "124", 
    up: "126",
    down: "125",
  };
  
  // Ensure Ghostty is frontmost before navigating
  await ensureGhosttyFrontmost();
  
  await execAsync(`osascript -e 'tell application "Ghostty" to activate' -e 'tell application "System Events" to tell process "Ghostty" to key code ${keyCodes[direction]} using command down'`);
  await delay(200); // Increased delay
}

export async function runCommand(command: string, workingDirectory?: string) {
  try {
    console.log(`Running command: ${command}`, workingDirectory ? `in directory: ${workingDirectory}` : '');
    
    // Ensure Ghostty is frontmost before sending commands
    await ensureGhosttyFrontmost();
    
    let fullCommand = command;
    
    if (workingDirectory) {
      // Expand tilde to home directory
      const expandedDir = workingDirectory.replace(/^~/, process.env.HOME || '');
      fullCommand = `cd "${expandedDir}" && ${command}`;
    }
    
    // Escape quotes and backslashes in the command
    const escapedCommand = fullCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    
    // Send the command character by character with a slight delay to ensure proper input
    const script = `osascript -e 'tell application "Ghostty" to activate' -e 'delay 0.2' -e 'tell application "System Events" to tell process "Ghostty" to keystroke "${escapedCommand}"' -e 'delay 0.1' -e 'tell application "System Events" to tell process "Ghostty" to key code 36'`;
    console.log("Executing command script:", script);
    const result = await execAsync(script);
    console.log("Command result:", result);
    await delay(800); // Longer delay to ensure command executes
  } catch (error) {
    console.error("Failed to run command:", error);
    throw error;
  }
}

export async function createLayoutStructure(
  structure: Split | Pane,
  rootDirectory?: string
): Promise<void> {
  // Ensure Ghostty is frontmost before starting
  await ensureGhosttyFrontmost();
  await delay(300);
  
  if ("command" in structure) {
    // It's a pane
    await runCommand(structure.command, structure.workingDirectory || rootDirectory);
    await delay(500); // Extra delay after each command
  } else {
    // It's a split
    const { direction, panes } = structure;
    
    for (let i = 0; i < panes.length; i++) {
      if (i > 0) {
        await createSplit(direction);
        
        // Navigate to the new pane
        if (direction === "vertical") {
          await navigateToPane("right");
        } else {
          await navigateToPane("down");
        }
      }
      
      const pane = panes[i];
      
      if ("direction" in pane) {
        // Nested split
        await createLayoutStructure(pane, rootDirectory);
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
    await execAsync('osascript -e "tell application \\"Ghostty\\" to activate"');
    await delay(300);
    
    // Double-check that Ghostty is frontmost
    const frontmostApp = await execAsync('osascript -e "tell application \\"System Events\\" to return name of first application process whose frontmost is true"');
    const appName = frontmostApp.stdout.trim();
    
    if (appName.toLowerCase() !== "ghostty") {
      console.warn(`Expected Ghostty to be frontmost, but got: ${appName}. Retrying...`);
      await execAsync('osascript -e "tell application \\"Ghostty\\" to activate"');
      await delay(500);
    }
  } catch (error) {
    console.error("Failed to ensure Ghostty is frontmost:", error);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
