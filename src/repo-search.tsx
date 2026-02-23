import {
  Action,
  ActionPanel,
  getPreferenceValues,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import React, { useEffect, useMemo, useState } from "react";
import { basename, dirname } from "path";
import { Layout } from "./types";
import { GhosttyTarget } from "./utils";
import RepoPicker from "./repo-picker";
import { expandHomePath, isDirectory } from "./domain/paths";
import { launchLayoutInDirectory } from "./services/layout-launcher";
import {
  getPinnedRepos,
  getRecentRepos,
  togglePinnedRepo,
} from "./services/launch-context";
import {
  getCachedRepoIndex,
  IndexedRepo,
  revalidateRepoIndex,
} from "./services/repo-index";

interface Props {
  layout: Layout;
  target: GhosttyTarget;
}

interface Preferences {
  developerFolder: string;
}

interface RepoSearchItem {
  name: string;
  path: string;
  isGitRepo: boolean;
}

export default function RepoSearch({ layout, target }: Props) {
  const { pop } = useNavigation();
  const preferences = getPreferenceValues<Preferences>();
  const developerPath = expandHomePath(preferences.developerFolder);
  const cachedIndex = getCachedRepoIndex(developerPath);

  const [repos, setRepos] = useState<IndexedRepo[]>(cachedIndex?.repos ?? []);
  const [indexUpdatedAt, setIndexUpdatedAt] = useState<number | undefined>(
    cachedIndex?.updatedAt,
  );
  const [pinnedRepoPaths, setPinnedRepoPaths] = useState<string[]>([]);
  const [recentRepoPaths, setRecentRepoPaths] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(!cachedIndex);
  const [isLaunching, setIsLaunching] = useState(false);

  const repoMap = useMemo(
    () => new Map(repos.map((repo) => [repo.path, repo])),
    [repos],
  );

  const repoPaths = useMemo(
    () => new Set(repos.map((repo) => repo.path)),
    [repos],
  );

  function toRepoSearchItem(pathValue: string): RepoSearchItem {
    const indexedRepo = repoMap.get(pathValue);

    if (indexedRepo) {
      return {
        name: indexedRepo.name,
        path: indexedRepo.path,
        isGitRepo: indexedRepo.isGitRepo,
      };
    }

    return {
      name: basename(pathValue),
      path: pathValue,
      isGitRepo: false,
    };
  }

  const pinnedRepos = pinnedRepoPaths.map((pathValue) =>
    toRepoSearchItem(pathValue),
  );

  const pinnedSet = useMemo(() => new Set(pinnedRepoPaths), [pinnedRepoPaths]);

  const recentRepos = recentRepoPaths
    .filter((pathValue) => !pinnedSet.has(pathValue))
    .map((pathValue) => toRepoSearchItem(pathValue));

  const hiddenPaths = useMemo(
    () => new Set([...pinnedRepoPaths, ...recentRepoPaths]),
    [pinnedRepoPaths, recentRepoPaths],
  );

  const indexedRepos = repos.filter((repo) => !hiddenPaths.has(repo.path));

  useEffect(() => {
    let cancelled = false;

    async function loadMeta() {
      const [recent, pinned] = await Promise.all([
        getRecentRepos(),
        getPinnedRepos(),
      ]);

      if (cancelled) {
        return;
      }

      setRecentRepoPaths(recent);
      setPinnedRepoPaths(pinned);
    }

    async function loadIndex() {
      try {
        const refreshed = await revalidateRepoIndex(developerPath);

        if (cancelled) {
          return;
        }

        setRepos(refreshed.repos);
        setIndexUpdatedAt(refreshed.updatedAt);
      } catch (error) {
        if (!cancelled) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Failed to index repositories",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadMeta();
    void loadIndex();

    return () => {
      cancelled = true;
    };
  }, [developerPath]);

  async function refreshIndex() {
    setIsLoading(true);
    try {
      const refreshed = await revalidateRepoIndex(developerPath);
      setRepos(refreshed.repos);
      setIndexUpdatedAt(refreshed.updatedAt);
      await showToast({
        style: Toast.Style.Success,
        title: "Repository index refreshed",
        message: `${refreshed.repos.length} repositories`,
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to refresh index",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function launchInRepo(repoPath: string) {
    if (!(await isDirectory(repoPath))) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Directory no longer exists",
        message: repoPath,
      });
      return;
    }

    setIsLaunching(true);
    try {
      await launchLayoutInDirectory({
        layout,
        repoPath,
        target,
      });

      const updatedRecent = await getRecentRepos();
      setRecentRepoPaths(updatedRecent);
      pop();
    } catch (error) {
      console.error("Repository launch error:", error);
    } finally {
      setIsLaunching(false);
    }
  }

  async function togglePin(repoPath: string) {
    const isPinned = await togglePinnedRepo(repoPath);

    setPinnedRepoPaths((previous) => {
      if (isPinned) {
        return [
          repoPath,
          ...previous.filter((pathValue) => pathValue !== repoPath),
        ];
      }

      return previous.filter((pathValue) => pathValue !== repoPath);
    });
  }

  function renderRepoItem(repo: RepoSearchItem, sectionPrefix: string) {
    const isPinned = pinnedSet.has(repo.path);
    const isIndexed = repoPaths.has(repo.path);
    const accessories = [] as { text: string }[];

    if (isPinned) {
      accessories.push({ text: "Pinned" });
    }

    if (!isIndexed) {
      accessories.push({ text: "Outside index" });
    }

    return (
      <List.Item
        key={`${sectionPrefix}-${repo.path}`}
        title={repo.name}
        subtitle={repo.path}
        icon={repo.isGitRepo ? Icon.CodeBlock : Icon.Folder}
        accessories={accessories}
        actions={
          <ActionPanel>
            <Action
              title="Launch Layout Here"
              icon={Icon.ArrowRight}
              onAction={() => void launchInRepo(repo.path)}
            />
            <Action
              title={isPinned ? "Unpin Repository" : "Pin Repository"}
              icon={isPinned ? Icon.PinDisabled : Icon.Pin}
              onAction={() => void togglePin(repo.path)}
            />
            <Action.Push
              title="Browse Parent Folder"
              icon={Icon.Folder}
              target={
                <RepoPicker
                  layout={layout}
                  target={target}
                  initialPath={dirname(repo.path)}
                />
              }
            />
            <Action.Push
              title="Browse Developer Folder"
              icon={Icon.Folder}
              target={<RepoPicker layout={layout} target={target} />}
            />
            <Action
              title="Refresh Repository Index"
              icon={Icon.ArrowClockwise}
              onAction={() => void refreshIndex()}
            />
          </ActionPanel>
        }
      />
    );
  }

  const indexDate = indexUpdatedAt
    ? new Date(indexUpdatedAt).toLocaleTimeString()
    : "not indexed yet";

  return (
    <List
      isLoading={isLoading || isLaunching}
      navigationTitle={`${layout.name} - Repository Search`}
      searchBarPlaceholder="Search repositories..."
    >
      {pinnedRepos.length > 0 && (
        <List.Section title="Pinned Repositories">
          {pinnedRepos.map((repo) => renderRepoItem(repo, "pinned"))}
        </List.Section>
      )}

      {recentRepos.length > 0 && (
        <List.Section title="Recent Repositories">
          {recentRepos.map((repo) => renderRepoItem(repo, "recent"))}
        </List.Section>
      )}

      <List.Section
        title="Indexed Repositories"
        subtitle={`${repos.length} repos • updated ${indexDate}`}
      >
        {indexedRepos.map((repo) =>
          renderRepoItem(
            {
              name: repo.name,
              path: repo.path,
              isGitRepo: repo.isGitRepo,
            },
            "indexed",
          ),
        )}
      </List.Section>

      <List.Section title="Fallback">
        <List.Item
          title="Browse Developer Folder..."
          subtitle={developerPath}
          icon={Icon.Folder}
          actions={
            <ActionPanel>
              <Action.Push
                title="Browse Folders"
                icon={Icon.Folder}
                target={<RepoPicker layout={layout} target={target} />}
              />
              <Action
                title="Refresh Repository Index"
                icon={Icon.ArrowClockwise}
                onAction={() => void refreshIndex()}
              />
            </ActionPanel>
          }
        />
      </List.Section>

      {repos.length === 0 && !isLoading && (
        <List.EmptyView
          title="No repositories indexed"
          description="Use fallback browsing or refresh the repository index"
          actions={
            <ActionPanel>
              <Action.Push
                title="Browse Folders"
                icon={Icon.Folder}
                target={<RepoPicker layout={layout} target={target} />}
              />
              <Action
                title="Refresh Repository Index"
                icon={Icon.ArrowClockwise}
                onAction={() => void refreshIndex()}
              />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
