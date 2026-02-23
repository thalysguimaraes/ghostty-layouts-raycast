import { closeMainWindow, PopToRootType, showToast, Toast } from "@raycast/api";
import { Layout } from "../types";
import { createLayoutStructure, GhosttyTarget, launchGhostty } from "../utils";
import { rememberRepoForLayout } from "./launch-context";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface LaunchLayoutOptions {
  layout: Layout;
  repoPath: string;
  target: GhosttyTarget;
}

export async function launchLayoutInDirectory({
  layout,
  repoPath,
  target,
}: LaunchLayoutOptions): Promise<void> {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Launching layout...",
    message: `${layout.name} in ${repoPath}`,
  });

  try {
    await closeMainWindow({
      clearRootSearch: false,
      popToRootType: PopToRootType.Suspended,
    });

    await wait(350);

    toast.message = "Opening Ghostty...";
    await launchGhostty(target);
    await wait(target === "current" ? 250 : 800);

    toast.message = "Creating layout...";
    await createLayoutStructure(
      layout.structure,
      repoPath,
      target === "current",
    );

    await rememberRepoForLayout(layout.id, repoPath);

    toast.style = Toast.Style.Success;
    toast.title = "Layout launched successfully";
    toast.message = layout.name;
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to launch layout";
    toast.message = error instanceof Error ? error.message : String(error);
    throw error;
  }
}
