import { LocalStorage } from "@raycast/api";

const LAST_USED_REPO_BY_LAYOUT_KEY = "ghostty-last-used-repo-by-layout-id";
const RECENT_REPOS_KEY = "ghostty-recent-repos";
const PINNED_REPOS_KEY = "ghostty-pinned-repos";
const MAX_RECENT_REPOS = 20;
const MAX_PINNED_REPOS = 50;

type LastUsedRepoByLayout = Record<string, string>;

async function getLastUsedMap(): Promise<LastUsedRepoByLayout> {
  const value = await LocalStorage.getItem<string>(
    LAST_USED_REPO_BY_LAYOUT_KEY,
  );
  return value ? (JSON.parse(value) as LastUsedRepoByLayout) : {};
}

async function saveLastUsedMap(map: LastUsedRepoByLayout): Promise<void> {
  await LocalStorage.setItem(LAST_USED_REPO_BY_LAYOUT_KEY, JSON.stringify(map));
}

function dedupePaths(paths: string[], max: number): string[] {
  return Array.from(new Set(paths)).slice(0, max);
}

export async function getLastUsedRepo(
  layoutId: string,
): Promise<string | undefined> {
  const map = await getLastUsedMap();
  return map[layoutId];
}

export async function setLastUsedRepo(
  layoutId: string,
  repoPath: string,
): Promise<void> {
  const map = await getLastUsedMap();
  map[layoutId] = repoPath;
  await saveLastUsedMap(map);
}

export async function getRecentRepos(): Promise<string[]> {
  const value = await LocalStorage.getItem<string>(RECENT_REPOS_KEY);
  return value ? (JSON.parse(value) as string[]) : [];
}

export async function addRecentRepo(repoPath: string): Promise<void> {
  const recent = await getRecentRepos();
  const deduped = dedupePaths([repoPath, ...recent], MAX_RECENT_REPOS);
  await LocalStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(deduped));
}

export async function getPinnedRepos(): Promise<string[]> {
  const value = await LocalStorage.getItem<string>(PINNED_REPOS_KEY);
  return value ? (JSON.parse(value) as string[]) : [];
}

async function setPinnedRepos(repoPaths: string[]): Promise<void> {
  await LocalStorage.setItem(
    PINNED_REPOS_KEY,
    JSON.stringify(dedupePaths(repoPaths, MAX_PINNED_REPOS)),
  );
}

export async function togglePinnedRepo(repoPath: string): Promise<boolean> {
  const pinned = await getPinnedRepos();

  if (pinned.includes(repoPath)) {
    await setPinnedRepos(pinned.filter((path) => path !== repoPath));
    return false;
  }

  await setPinnedRepos([repoPath, ...pinned]);
  return true;
}

export async function rememberRepoForLayout(
  layoutId: string,
  repoPath: string,
): Promise<void> {
  await Promise.all([
    setLastUsedRepo(layoutId, repoPath),
    addRecentRepo(repoPath),
  ]);
}
