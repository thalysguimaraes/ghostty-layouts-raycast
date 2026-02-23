import { Cache } from "@raycast/api";
import { readdir, stat } from "fs/promises";
import { basename, join } from "path";
import { isDirectory } from "../domain/paths";

export interface IndexedRepo {
  name: string;
  path: string;
  isGitRepo: boolean;
  depth: number;
}

export interface RepoIndexPayload {
  rootDirectory: string;
  repos: IndexedRepo[];
  maxDepth: number;
  updatedAt: number;
}

interface BuildRepoIndexOptions {
  maxDepth?: number;
  concurrency?: number;
}

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_CONCURRENCY = 10;
const CACHE_VERSION = 1;
const REPO_INDEX_CACHE = new Cache({ namespace: "ghostty-repo-index" });

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

async function hasGitDirectory(pathValue: string): Promise<boolean> {
  try {
    const gitStats = await stat(join(pathValue, ".git"));
    return gitStats.isDirectory() || gitStats.isFile();
  } catch {
    return false;
  }
}

async function listChildDirectories(pathValue: string): Promise<string[]> {
  try {
    const entries = await readdir(pathValue, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => join(pathValue, entry.name));
  } catch {
    return [];
  }
}

function sortRepos(repos: IndexedRepo[]): IndexedRepo[] {
  return repos.sort((a, b) => {
    const nameDiff = a.name.localeCompare(b.name);
    if (nameDiff !== 0) {
      return nameDiff;
    }

    return a.path.localeCompare(b.path);
  });
}

function getCacheKey(rootDirectory: string, maxDepth: number): string {
  return `v${CACHE_VERSION}:${rootDirectory}:${maxDepth}`;
}

function parsePayload(raw: string | undefined): RepoIndexPayload | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as RepoIndexPayload;
  } catch {
    return undefined;
  }
}

export function getCachedRepoIndex(
  rootDirectory: string,
  options?: BuildRepoIndexOptions,
): RepoIndexPayload | undefined {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  return parsePayload(
    REPO_INDEX_CACHE.get(getCacheKey(rootDirectory, maxDepth)),
  );
}

export async function revalidateRepoIndex(
  rootDirectory: string,
  options?: BuildRepoIndexOptions,
): Promise<RepoIndexPayload> {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;

  const payload: RepoIndexPayload = {
    rootDirectory,
    repos: await buildRepoIndex(rootDirectory, { maxDepth, concurrency }),
    maxDepth,
    updatedAt: Date.now(),
  };

  REPO_INDEX_CACHE.set(
    getCacheKey(rootDirectory, maxDepth),
    JSON.stringify(payload),
  );

  return payload;
}

async function buildRepoIndex(
  rootDirectory: string,
  options?: BuildRepoIndexOptions,
): Promise<IndexedRepo[]> {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;

  if (!(await isDirectory(rootDirectory))) {
    return [];
  }

  const repos = new Map<string, IndexedRepo>();

  if (await hasGitDirectory(rootDirectory)) {
    repos.set(rootDirectory, {
      name: basename(rootDirectory),
      path: rootDirectory,
      isGitRepo: true,
      depth: 0,
    });
  }

  let currentLevelDirectories = [rootDirectory];

  for (let depth = 0; depth < maxDepth; depth++) {
    const childDirectories = (
      await mapWithConcurrency(
        currentLevelDirectories,
        concurrency,
        (directory) => listChildDirectories(directory),
      )
    ).flat();

    if (childDirectories.length === 0) {
      break;
    }

    const checkedDirectories = await mapWithConcurrency(
      childDirectories,
      concurrency,
      async (pathValue) => ({
        path: pathValue,
        isGitRepo: await hasGitDirectory(pathValue),
      }),
    );

    const nextLevelDirectories: string[] = [];

    for (const checkedDirectory of checkedDirectories) {
      if (checkedDirectory.isGitRepo) {
        repos.set(checkedDirectory.path, {
          name: basename(checkedDirectory.path),
          path: checkedDirectory.path,
          isGitRepo: true,
          depth: depth + 1,
        });
      } else {
        nextLevelDirectories.push(checkedDirectory.path);
      }
    }

    currentLevelDirectories = nextLevelDirectories;

    if (currentLevelDirectories.length === 0) {
      break;
    }
  }

  return sortRepos(Array.from(repos.values()));
}
