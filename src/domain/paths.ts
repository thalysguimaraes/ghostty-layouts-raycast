import { stat } from "fs/promises";
import { homedir } from "os";
import { isAbsolute, join } from "path";

export function expandHomePath(pathValue: string): string {
  if (!pathValue.startsWith("~")) {
    return pathValue;
  }

  if (pathValue === "~") {
    return homedir();
  }

  if (pathValue.startsWith("~/")) {
    return join(homedir(), pathValue.slice(2));
  }

  return pathValue;
}

export function resolveWorkingDirectory(
  paneDirectory: string | undefined,
  rootDirectory: string | undefined,
): string | undefined {
  if (!paneDirectory) {
    return rootDirectory ? expandHomePath(rootDirectory) : undefined;
  }

  if (isAbsolute(paneDirectory) || paneDirectory.startsWith("~")) {
    return expandHomePath(paneDirectory);
  }

  if (rootDirectory) {
    return join(expandHomePath(rootDirectory), paneDirectory);
  }

  return paneDirectory;
}

export async function isDirectory(pathValue: string): Promise<boolean> {
  try {
    const stats = await stat(pathValue);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
