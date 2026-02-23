import { LocalStorage } from "@raycast/api";
import {
  addRecentRepo,
  getLastUsedRepo,
  getPinnedRepos,
  getRecentRepos,
  setLastUsedRepo,
  togglePinnedRepo,
} from "../../services/launch-context";

describe("launch-context", () => {
  const getItemMock = LocalStorage.getItem as jest.Mock;
  const setItemMock = LocalStorage.setItem as jest.Mock;

  beforeEach(() => {
    getItemMock.mockReset();
    setItemMock.mockReset();
  });

  it("sets and retrieves last used repository", async () => {
    getItemMock.mockResolvedValueOnce(undefined);

    await setLastUsedRepo("layout-1", "/Users/dev/repo");

    expect(setItemMock).toHaveBeenCalledWith(
      "ghostty-last-used-repo-by-layout-id",
      JSON.stringify({ "layout-1": "/Users/dev/repo" }),
    );

    getItemMock.mockResolvedValueOnce(
      JSON.stringify({ "layout-1": "/Users/dev/repo" }),
    );

    await expect(getLastUsedRepo("layout-1")).resolves.toBe("/Users/dev/repo");
  });

  it("deduplicates recent repositories", async () => {
    getItemMock.mockResolvedValueOnce(
      JSON.stringify(["/Users/dev/repo-b", "/Users/dev/repo-a"]),
    );

    await addRecentRepo("/Users/dev/repo-a");

    expect(setItemMock).toHaveBeenCalledWith(
      "ghostty-recent-repos",
      JSON.stringify(["/Users/dev/repo-a", "/Users/dev/repo-b"]),
    );
  });

  it("returns empty arrays for missing pinned and recent repositories", async () => {
    getItemMock.mockResolvedValueOnce(undefined);
    await expect(getPinnedRepos()).resolves.toEqual([]);

    getItemMock.mockResolvedValueOnce(undefined);
    await expect(getRecentRepos()).resolves.toEqual([]);
  });

  it("toggles pin state for repositories", async () => {
    getItemMock.mockResolvedValueOnce(JSON.stringify(["/Users/dev/repo-a"]));

    await expect(togglePinnedRepo("/Users/dev/repo-b")).resolves.toBe(true);
    expect(setItemMock).toHaveBeenCalledWith(
      "ghostty-pinned-repos",
      JSON.stringify(["/Users/dev/repo-b", "/Users/dev/repo-a"]),
    );

    getItemMock.mockResolvedValueOnce(
      JSON.stringify(["/Users/dev/repo-a", "/Users/dev/repo-b"]),
    );

    await expect(togglePinnedRepo("/Users/dev/repo-a")).resolves.toBe(false);
    expect(setItemMock).toHaveBeenCalledWith(
      "ghostty-pinned-repos",
      JSON.stringify(["/Users/dev/repo-b"]),
    );
  });
});
