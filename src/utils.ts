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
import { resolveWorkingDirectory } from "./domain/paths";
import { keystrokeGhosttyController } from "./services/ghostty/controller-keystrokes";

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
    const windowTitle = (
      await keystrokeGhosttyController.getWindowTitle()
    ).trim();

    if (windowTitle) {
      if (windowTitle.includes(":")) {
        const colonIndex = windowTitle.lastIndexOf(":");
        const dirPart = windowTitle.substring(colonIndex + 1).trim();
        if (dirPart.startsWith("/") || dirPart.startsWith("~")) {
          return dirPart.startsWith("~")
            ? dirPart.replace("~", process.env.HOME || "")
            : dirPart;
        }
      }

      const parts = windowTitle.split(/\s+/);
      const lastPart = parts[parts.length - 1];
      if (lastPart && (lastPart.startsWith("/") || lastPart.startsWith("~"))) {
        return lastPart.startsWith("~")
          ? lastPart.replace("~", process.env.HOME || "")
          : lastPart;
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export async function detectCurrentGhosttyTab(): Promise<GhosttyTabInfo> {
  try {
    const isRunning = await isGhosttyRunning();
    if (!isRunning) {
      return { isSingleTab: false };
    }

    let windowTitle = "";
    let windowSubtitle = "";

    try {
      windowTitle = (await keystrokeGhosttyController.getWindowTitle()).trim();

      try {
        windowSubtitle = (
          await keystrokeGhosttyController.getWindowDescription()
        ).trim();
      } catch {
        windowSubtitle = "";
      }
    } catch {
      try {
        windowTitle = (await keystrokeGhosttyController.getWindowName()).trim();
      } catch {
        windowTitle = "";
      }
    }

    let currentDirectory: string | undefined;

    if (
      windowSubtitle &&
      (windowSubtitle.startsWith("/") || windowSubtitle.startsWith("~"))
    ) {
      currentDirectory = windowSubtitle;
    } else {
      if (windowTitle.includes(" - ")) {
        const parts = windowTitle.split(" - ");
        currentDirectory = parts[parts.length - 1];
      } else if (windowTitle.includes(":")) {
        const colonIndex = windowTitle.lastIndexOf(":");
        currentDirectory = windowTitle.substring(colonIndex + 1);
      } else if (windowTitle.startsWith("/") || windowTitle.startsWith("~")) {
        currentDirectory = windowTitle;
      } else {
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

    if (currentDirectory) {
      currentDirectory = currentDirectory.replace(/[>\])]*$/, "").trim();

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
  } catch {
    return { isSingleTab: false };
  }
}

export async function launchGhostty(target: GhosttyTarget = "new-window") {
  try {
    const isRunning = await isGhosttyRunning();

    if (target === "current" && isRunning) {
      await keystrokeGhosttyController.activate();
      await adaptiveDelay.wait("activation");
      adaptiveDelay.recordSuccess("activation");
    } else if (target === "new-tab" && isRunning) {
      await keystrokeGhosttyController.activate();
      await adaptiveDelay.wait("activation");
      adaptiveDelay.recordSuccess("activation");
      await ensureGhosttyFrontmost();
      await adaptiveDelay.wait("frontmost");
      await keystrokeGhosttyController.newTab();
      await adaptiveDelay.wait("new-tab");
      adaptiveDelay.recordSuccess("new-tab");
    } else {
      if (isRunning) {
        await keystrokeGhosttyController.activate();
        await adaptiveDelay.wait("activation");
        adaptiveDelay.recordSuccess("activation");
        await keystrokeGhosttyController.newWindow();
        await adaptiveDelay.wait("new-window");
        adaptiveDelay.recordSuccess("new-window");
      } else {
        await execAsync("open -a Ghostty");
        await adaptiveDelay.wait("launch");
        adaptiveDelay.recordSuccess("launch");
      }
    }

    try {
      await keystrokeGhosttyController.getFrontmostAppName();
    } catch {
      return;
    }
  } catch {
    throw new Error(
      "Failed to launch Ghostty. Make sure Ghostty is installed.",
    );
  }
}

export async function createSplit(direction: "vertical" | "horizontal") {
  try {
    await ensureGhosttyFrontmost();

    await withRetry(
      () =>
        withTimeout(
          keystrokeGhosttyController.split(direction),
          5000,
          "Split creation timed out",
        ),
      {
        maxRetries: 2,
        retryDelay: 500,
        onRetry: () => {
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
  await ensureGhosttyFrontmost();

  await keystrokeGhosttyController.navigate(direction);
  await adaptiveDelay.wait("navigate");
  adaptiveDelay.recordSuccess("navigate");
}

export async function runCommand(command: string, workingDirectory?: string) {
  try {
    await ensureGhosttyFrontmost();

    let fullCommand = command;

    if (workingDirectory) {
      const expandedDir = workingDirectory.replace(
        /^~/,
        process.env.HOME || "",
      );
      fullCommand = `cd "${expandedDir}" && ${command}`;
    }

    await withRetry(
      () =>
        withTimeout(
          (async () => {
            await keystrokeGhosttyController.sendText(fullCommand);
            await adaptiveDelay.wait("command-enter");
            await keystrokeGhosttyController.pressEnter();
          })(),
          10000,
          "Command execution timed out",
        ),
      {
        maxRetries: 2,
        retryDelay: 1000,
        onRetry: () => {
          adaptiveDelay.recordFailure("command");
        },
        shouldRetry: (error) => {
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
    const paneDirectory = resolveWorkingDirectory(
      structure.workingDirectory,
      rootDirectory,
    );
    await runCommand(structure.command, paneDirectory);
    await adaptiveDelay.wait("pane-command");
    adaptiveDelay.recordSuccess("pane-command");
  } else {
    const { direction, panes } = structure;

    for (let i = 0; i < panes.length; i++) {
      if (i > 0 || !useCurrentTab) {
        if (i > 0) {
          await createSplit(direction);
          if (direction === "vertical") {
            await navigateToPane("right");
          } else {
            await navigateToPane("down");
          }
        }
      }

      const pane = panes[i];

      if ("direction" in pane) {
        await createLayoutStructure(pane, rootDirectory, false);
      } else {
        const paneDirectory = resolveWorkingDirectory(
          pane.workingDirectory,
          rootDirectory,
        );
        await runCommand(pane.command, paneDirectory);
      }
    }

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
    await keystrokeGhosttyController.activate();
    await adaptiveDelay.wait("frontmost");
    adaptiveDelay.recordSuccess("frontmost");

    const appName = (
      await keystrokeGhosttyController.getFrontmostAppName()
    ).trim();

    if (appName.toLowerCase() !== "ghostty") {
      await keystrokeGhosttyController.activate();
      await adaptiveDelay.wait("retry-frontmost");
      adaptiveDelay.recordSuccess("retry-frontmost");
    }
  } catch {
    return;
  }
}

export function resetDelays(): void {
  adaptiveDelay.resetAll();
}
