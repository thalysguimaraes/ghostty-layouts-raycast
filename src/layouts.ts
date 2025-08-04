import { LocalStorage } from "@raycast/api";
import { Layout, LayoutPreset } from "./types";

const STORAGE_KEY = "ghostty-layouts";

// Predefined layout presets
export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    name: "Development",
    description: "Neovim (70%) | Cloud Code / LazyGit",
    structure: {
      direction: "vertical",
      panes: [
        {
          command: "nvim",
          size: 70,
        },
        {
          direction: "horizontal",
          panes: [
            { command: "amp" }, // or cloud-code
            { command: "lazygit" },
          ],
        },
      ],
    },
  },
  {
    name: "Full Stack",
    description: "Editor | Frontend / Backend / Git",
    structure: {
      direction: "vertical",
      panes: [
        {
          command: "nvim",
          size: 60,
        },
        {
          direction: "horizontal",
          panes: [
            { command: "npm run dev", workingDirectory: "./frontend" },
            { command: "npm run server", workingDirectory: "./backend" },
            { command: "lazygit" },
          ],
        },
      ],
    },
  },
  {
    name: "Simple Split",
    description: "Two vertical panes",
    structure: {
      direction: "vertical",
      panes: [
        { command: "nvim" },
        { command: "zsh" },
      ],
    },
  },
];

export async function getLayouts(): Promise<Layout[]> {
  const stored = await LocalStorage.getItem<string>(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}

export async function saveLayout(layout: Layout): Promise<void> {
  const layouts = await getLayouts();
  const existingIndex = layouts.findIndex((l) => l.id === layout.id);
  
  if (existingIndex >= 0) {
    layouts[existingIndex] = layout;
  } else {
    layouts.push(layout);
  }
  
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
}

export async function deleteLayout(id: string): Promise<void> {
  const layouts = await getLayouts();
  const filtered = layouts.filter((l) => l.id !== id);
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}
