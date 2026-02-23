import { useNavigation } from "@raycast/api";
import React, { useEffect } from "react";
import { Layout } from "./types";
import RepoSearch from "./repo-search";
import { detectCurrentGhosttyTab, GhosttyTarget } from "./utils";
import { getLastUsedRepo } from "./services/launch-context";
import { launchLayoutInDirectory } from "./services/layout-launcher";
import { expandHomePath, isDirectory } from "./domain/paths";

interface Props {
  layout: Layout;
  target?: GhosttyTarget;
  preferredRepoPath?: string;
}

export default function LaunchLayout({
  layout,
  target = "new-tab",
  preferredRepoPath,
}: Props) {
  const { push } = useNavigation();

  useEffect(() => {
    let cancelled = false;

    async function launchFromPath(pathValue: string): Promise<boolean> {
      const normalizedPath = expandHomePath(pathValue);
      if (!(await isDirectory(normalizedPath))) {
        return false;
      }

      await launchLayoutInDirectory({
        layout,
        repoPath: normalizedPath,
        target,
      });

      return true;
    }

    async function run() {
      try {
        if (preferredRepoPath && (await launchFromPath(preferredRepoPath))) {
          return;
        }

        const lastUsedRepo = await getLastUsedRepo(layout.id);
        if (target !== "current") {
          const primaryCandidates = [lastUsedRepo, layout.rootDirectory];

          for (const candidate of primaryCandidates) {
            if (!candidate) {
              continue;
            }

            if (await launchFromPath(candidate)) {
              return;
            }
          }
        }

        const tabInfo = await detectCurrentGhosttyTab();
        const currentTabDirectory = tabInfo.currentDirectory;

        const fallbackCandidates =
          target === "current"
            ? [currentTabDirectory, lastUsedRepo, layout.rootDirectory]
            : [currentTabDirectory];

        for (const candidate of fallbackCandidates) {
          if (!candidate) {
            continue;
          }

          if (await launchFromPath(candidate)) {
            return;
          }
        }

        if (!cancelled) {
          push(<RepoSearch layout={layout} target={target} />);
        }
      } catch (error) {
        console.error("Launch routing error:", error);
        return;
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [layout, preferredRepoPath, push, target]);

  return null;
}
