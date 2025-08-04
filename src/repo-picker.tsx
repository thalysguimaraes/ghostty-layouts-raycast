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
import { GhosttyTarget, launchGhostty, createLayoutStructure } from "./utils";
import { readdir, stat } from "fs/promises";
import { join, basename, dirname } from "path";
import { homedir } from "os";

interface Props {
  layout: Layout;
  target: GhosttyTarget;
}

interface RepoFolder {
  name: string;
  path: string;
  isGitRepo: boolean;
}

interface Preferences {
  developerFolder: string;
}

export default function RepoPicker({ layout, target }: Props) {
  const { pop } = useNavigation();
  const [repos, setRepos] = useState<RepoFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState<string>("");
  const preferences = getPreferenceValues<Preferences>();

  useEffect(() => {
    const developerPath = preferences.developerFolder.replace(/^~/, homedir());
    setCurrentPath(developerPath);
  }, []);

  useEffect(() => {
    if (currentPath) {
      loadRepos(currentPath);
    }
  }, [currentPath]);

  async function loadRepos(path: string) {
    setIsLoading(true);
    try {
      const items = await readdir(path);
      const repoFolders: RepoFolder[] = [];

      for (const item of items) {
        const fullPath = join(path, item);
        try {
          const stats = await stat(fullPath);
          if (stats.isDirectory()) {
            // Check if it's a git repo
            let isGitRepo = false;
            try {
              await stat(join(fullPath, '.git'));
              isGitRepo = true;
            } catch {
              // Not a git repo, but still include it
            }
            
            repoFolders.push({
              name: item,
              path: fullPath,
              isGitRepo,
            });
          }
        } catch {
          // Skip items we can't access
        }
      }

      // Sort: git repos first, then alphabetically
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

  function navigateToFolder(folderPath: string) {
    setCurrentPath(folderPath);
  }

  function navigateUp() {
    const parentPath = dirname(currentPath);
    const developerPath = preferences.developerFolder.replace(/^~/, homedir());
    
    // Don't go above the developer folder
    if (parentPath.length >= developerPath.length) {
      setCurrentPath(parentPath);
    }
  }

  function getRelativePath() {
    const developerPath = preferences.developerFolder.replace(/^~/, homedir());
    if (currentPath === developerPath) {
      return "~/Developer";
    }
    const relative = currentPath.replace(developerPath, "");
    return `~/Developer${relative}`;
  }

  async function handleLaunchInRepo(repoPath: string) {
    try {
      showToast({
        style: Toast.Style.Animated,
        title: "Launching layout...",
        message: `${layout.name} in ${repoPath}`,
      });

      await launchGhostty(target);
      
      // Additional delay to ensure Ghostty is ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await createLayoutStructure(layout.structure, repoPath);

      showToast({
        style: Toast.Style.Success,
        title: "Layout launched successfully",
        message: layout.name,
      });
      
      pop();
    } catch (error) {
      console.error("Layout launch error:", error);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to launch layout",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const developerPath = preferences.developerFolder.replace(/^~/, homedir());
  const canGoUp = currentPath !== developerPath;

  return (
    <List 
      isLoading={isLoading} 
      searchBarPlaceholder="Search folders and repositories..."
      navigationTitle={`${layout.name} - ${getRelativePath()}`}
    >
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
                    onAction={() => handleLaunchInRepo(repo.path)}
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
                    onAction={() => handleLaunchInRepo(repo.path)}
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
