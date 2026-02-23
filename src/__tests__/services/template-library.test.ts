import { LocalStorage } from "@raycast/api";
import {
  addCustomNodeTemplate,
  exportCustomNodeTemplates,
  getCustomNodeTemplates,
  importCustomNodeTemplates,
  removeCustomNodeTemplate,
} from "../../services/template-library";

describe("template-library", () => {
  const getItemMock = LocalStorage.getItem as jest.Mock;
  const setItemMock = LocalStorage.setItem as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty list when storage is missing", async () => {
    getItemMock.mockResolvedValueOnce(undefined);

    await expect(getCustomNodeTemplates()).resolves.toEqual([]);
  });

  it("returns empty list when stored data is invalid", async () => {
    getItemMock.mockResolvedValueOnce("not-json");

    await expect(getCustomNodeTemplates()).resolves.toEqual([]);
  });

  it("adds a custom pane template", async () => {
    getItemMock.mockResolvedValueOnce(undefined);

    const created = await addCustomNodeTemplate("My Shell", { command: "zsh" });

    expect(created.title).toBe("My Shell");
    expect(created.id).toBeTruthy();
    expect(setItemMock).toHaveBeenCalledTimes(1);

    const [, value] = setItemMock.mock.calls[0];
    const saved = JSON.parse(value as string) as Array<{
      id: string;
      title: string;
      node: { command: string };
    }>;

    expect(saved).toHaveLength(1);
    expect(saved[0].title).toBe("My Shell");
    expect(saved[0].node.command).toBe("zsh");
  });

  it("removes a custom template", async () => {
    getItemMock.mockResolvedValueOnce(
      JSON.stringify([
        { id: "a", title: "One", node: { command: "zsh" } },
        { id: "b", title: "Two", node: { command: "npm run dev" } },
      ]),
    );

    await removeCustomNodeTemplate("a");

    expect(setItemMock).toHaveBeenCalledTimes(1);

    const [, value] = setItemMock.mock.calls[0];
    const saved = JSON.parse(value as string) as Array<{ id: string }>;
    expect(saved).toEqual([
      { id: "b", title: "Two", node: { command: "npm run dev" } },
    ]);
  });

  it("exports templates as formatted JSON", async () => {
    getItemMock.mockResolvedValueOnce(
      JSON.stringify([
        { id: "b", title: "B", node: { command: "zsh" } },
        { id: "a", title: "A", node: { command: "nvim ." } },
      ]),
    );

    const exported = await exportCustomNodeTemplates();
    const parsed = JSON.parse(exported) as Array<{ id: string; title: string }>;

    expect(parsed).toEqual([
      { id: "a", title: "A", node: { command: "nvim ." } },
      { id: "b", title: "B", node: { command: "zsh" } },
    ]);
  });

  it("imports templates in merge mode", async () => {
    getItemMock.mockResolvedValueOnce(
      JSON.stringify([{ id: "a", title: "Alpha", node: { command: "zsh" } }]),
    );

    const result = await importCustomNodeTemplates(
      JSON.stringify([
        { id: "b", title: "Beta", node: { command: "npm run dev" } },
      ]),
      { mode: "merge" },
    );

    expect(result).toEqual({ imported: 1, total: 2 });
    expect(setItemMock).toHaveBeenCalledTimes(1);

    const [, value] = setItemMock.mock.calls[0];
    const saved = JSON.parse(value as string) as Array<{ title: string }>;
    expect(saved.map((template) => template.title)).toEqual(["Alpha", "Beta"]);
  });

  it("imports templates in replace mode", async () => {
    const result = await importCustomNodeTemplates(
      JSON.stringify([
        { title: "Gamma", node: { command: "docker ps" } },
        {
          title: "Delta",
          node: {
            direction: "horizontal",
            panes: [{ command: "nvim ." }, { command: "zsh" }],
          },
        },
      ]),
      { mode: "replace" },
    );

    expect(result.imported).toBe(2);
    expect(result.total).toBe(2);
    expect(setItemMock).toHaveBeenCalledTimes(1);

    const [, value] = setItemMock.mock.calls[0];
    const saved = JSON.parse(value as string) as Array<{
      title: string;
      id: string;
    }>;
    expect(saved).toHaveLength(2);
    expect(saved[0].title).toBe("Delta");
    expect(saved[1].title).toBe("Gamma");
    expect(saved[0].id).toBeTruthy();
    expect(saved[1].id).toBeTruthy();
  });

  it("throws when import payload is invalid", async () => {
    await expect(importCustomNodeTemplates("not-json")).rejects.toThrow(
      "Invalid JSON payload",
    );
  });

  it("resolves id conflicts during import", async () => {
    getItemMock.mockResolvedValueOnce(
      JSON.stringify([
        { id: "fixed", title: "Existing", node: { command: "zsh" } },
      ]),
    );

    await importCustomNodeTemplates(
      JSON.stringify([
        { id: "fixed", title: "Incoming", node: { command: "npm run dev" } },
      ]),
      { mode: "merge" },
    );

    const [, value] = setItemMock.mock.calls[0];
    const saved = JSON.parse(value as string) as Array<{
      id: string;
      title: string;
    }>;
    expect(saved).toHaveLength(2);
    expect(saved[0].id).toBe("fixed");
    expect(saved[1].id).not.toBe("fixed");
  });
});
