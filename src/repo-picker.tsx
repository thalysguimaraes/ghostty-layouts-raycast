import {
  Action,
  ActionPanel,
  List,
  Icon,
  showToast,
  Toast,
  getPreferenceValues,
  useNavigation,
} from "@raycast/api";
import React, { useState, useEffect } from "react";
import { Layout } from "./types";
import { GhosttyTarget } from "./utils";
import { readdir, stat } from "fs/promises";
import { basename, dirname, join } from "path";
import { homedir } from "os";
import { launchLayoutInDirectory } from "./services/layout-launcher";
import { getRecentRepos } from "./services/launch-context";
import { isDirectory } from "./domain/paths";

interface Props {
  layout: Layout;
  target: GhosttyTarget;
  useCurrentTab?: boolean;
  currentDirectory?: string;
  initialPath?: string;
}

interface RepoFolder {
  name: string;
  path: string;
  isGitRepo: boolean;
}

interface Preferences {
  developerFolder: string;
}

interface RecentRepo {
  name: string;
  path: string;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const index = currentIndex;
      currentIndex += 1;

      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}

export default function RepoPicker({
  layout,
  target,
  useCurrentTab,
  currentDirectory,
  initialPath,
}: Props) {
  const { pop } = useNavigation();
  const [repos, setRepos] = useState<RepoFolder[]>([]);
  const [recentRepos, setRecentRepos] = useState<RecentRepo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLaunching, setIsLaunching] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>("");
  const preferences = getPreferenceValues<Preferences>();
  const developerPath = preferences.developerFolder.replace(/^~/, homedir());

  useEffect(() => {
    if (useCurrentTab && currentDirectory) {
      void handleLaunchInRepo(currentDirectory);
      return;
    }

    const startingPath =
      initialPath && initialPath.startsWith(developerPath)
        ? initialPath
        : developerPath;

    setCurrentPath(startingPath);
    void loadRecentRepositories();
  }, [currentDirectory, developerPath, initialPath, useCurrentTab]);

  useEffect(() => {
    if (currentPath) {
      void loadRepos(currentPath);
    }
  }, [currentPath]);

  async function loadRepos(path: string) {
    setIsLoading(true);
    try {
      const entries = await readdir(path, { withFileTypes: true });
      const directories = entries.filter(
        (entry) => entry.isDirectory() && !entry.name.startsWith("."),
      );

      const repoFolders = await mapWithConcurrency(
        directories,
        12,
        async (entry) => {
          const fullPath = join(path, entry.name);
          let isGitRepo = false;

          try {
            const gitStats = await stat(join(fullPath, ".git"));
            isGitRepo = gitStats.isDirectory() || gitStats.isFile();
          } catch {
            isGitRepo = false;
          }

          return {
            name: entry.name,
            path: fullPath,
            isGitRepo,
          };
        },
      );

      repoFolders.sort((a, b) => {
        if (a.isGitRepo && !b.isGitRepo) return -1;
        if (!a.isGitRepo && b.isGitRepo) return 1;
        return a.name.localeCompare(b.name);
      });

      setRepos(repoFolders);
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to load directories",
        message: `Could not access: ${path}`,
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function loadRecentRepositories() {
    try {
      const recent = await getRecentRepos();
      const checked = await mapWithConcurrency(recent, 8, async (repoPath) => {
        if (!(await isDirectory(repoPath))) {
          return null;
        }

        return {
          name: basename(repoPath),
          path: repoPath,
        } as RecentRepo;
      });

      setRecentRepos(
        checked.filter((repo): repo is RecentRepo => repo !== null),
      );
    } catch {
      setRecentRepos([]);
    }
  }

  function navigateToFolder(folderPath: string) {
    setCurrentPath(folderPath);
  }

  function navigateUp() {
    const parentPath = dirname(currentPath);

    if (parentPath.length >= developerPath.length) {
      setCurrentPath(parentPath);
    }
  }

  function normalizePathDisplay(path: string): string {
    const home = homedir();
    return path.startsWith(home) ? path.replace(home, "~") : path;
  }

  function getRelativePath() {
    if (currentPath === developerPath) {
      return normalizePathDisplay(developerPath);
    }

    if (currentPath.startsWith(developerPath)) {
      const relative = currentPath.replace(developerPath, "");
      return `${normalizePathDisplay(developerPath)}${relative}`;
    }

    return normalizePathDisplay(currentPath);
  }

  async function handleLaunchInRepo(repoPath: string) {
    setIsLaunching(true);
    try {
      await launchLayoutInDirectory({
        layout,
        repoPath,
        target,
      });
      await loadRecentRepositories();
      pop();
    } catch (error) {
      console.error("Layout launch error:", error);
    } finally {
      setIsLaunching(false);
    }
  }

  const canGoUp = currentPath !== developerPath;

  return (
    <List
      isLoading={isLoading || isLaunching}
      searchBarPlaceholder="Search folders and repositories..."
      navigationTitle={`${layout.name} - ${getRelativePath()}`}
    >
      {recentRepos.length > 0 && (
        <List.Section title="Recent Repositories">
          {recentRepos.map((repo) => (
            <List.Item
              key={`recent-${repo.path}`}
              title={repo.name}
              subtitle={repo.path}
              icon={Icon.Clock}
              actions={
                <ActionPanel>
                  <Action
                    title="Launch Layout Here"
                    icon={Icon.ArrowRight}
                    onAction={() => void handleLaunchInRepo(repo.path)}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      <List.Section title="Navigation">
        {canGoUp && (
          <List.Item
            title=".. (Parent Directory)"
            subtitle={dirname(currentPath)}
            icon={Icon.ArrowUp}
            actions={
              <ActionPanel>
                <Action
                  title="Go Up"
                  icon={Icon.ArrowUp}
                  onAction={navigateUp}
                />
              </ActionPanel>
            }
          />
        )}
      </List.Section>

      <List.Section title="Folders & Repositories">
        {repos.map((repo) => (
          <List.Item
            key={repo.path}
            title={repo.name}
            subtitle={repo.path}
            icon={repo.isGitRepo ? Icon.CodeBlock : Icon.Folder}
            accessories={[
              { text: repo.isGitRepo ? "Git Repository" : "Folder" },
            ]}
            actions={
              <ActionPanel>
                {repo.isGitRepo ? (
                  <Action
                    title="Launch Layout Here"
                    icon={Icon.ArrowRight}
                    onAction={() => void handleLaunchInRepo(repo.path)}
                  />
                ) : (
                  <Action
                    title="Enter Folder"
                    icon={Icon.ArrowRight}
                    onAction={() => navigateToFolder(repo.path)}
                  />
                )}
                {!repo.isGitRepo && (
                  <Action
                    title="Launch Layout Here Anyway"
                    icon={Icon.Terminal}
                    onAction={() => void handleLaunchInRepo(repo.path)}
                  />
                )}
                {repo.isGitRepo && (
                  <Action
                    title="Enter Repository Folder"
                    icon={Icon.Folder}
                    onAction={() => navigateToFolder(repo.path)}
                  />
                )}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      {repos.length === 0 && !isLoading && (
        <List.EmptyView
          title="No folders found"
          description={`Current path: ${currentPath}`}
          actions={
            <ActionPanel>
              {canGoUp && (
                <Action
                  title="Go Up"
                  icon={Icon.ArrowUp}
                  onAction={navigateUp}
                />
              )}
              <Action.Open
                title="Open Raycast Preferences"
                target="raycast://extensions/thalysguimaraes/ghostty-layouts"
                icon={Icon.Gear}
              />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
