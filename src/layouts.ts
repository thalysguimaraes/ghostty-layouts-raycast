import { LocalStorage } from "@raycast/api";
import { Layout, LayoutPreset } from "./types";

const STORAGE_KEY = "ghostty-layouts";

// Predefined layout templates with great TUI tools
export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    name: "Developer Workspace",
    description: "nvim + lf + lazygit + zsh",
    icon: "Code",
    structure: {
      direction: "vertical",
      panes: [
        {
          command: "nvim .",
          size: 65,
        },
        {
          direction: "horizontal",
          panes: [
            { command: "lf" }, // LF file manager
            { command: "lazygit" },
            { command: "zsh" },
          ],
        },
      ],
    },
  },
  {
    name: "System Monitor",
    description: "top + htop + df + logs",
    icon: "ComputerChip",
    structure: {
      direction: "horizontal",
      panes: [
        {
          direction: "vertical",
          panes: [
            { command: "top -o cpu" }, // macOS compatible top
            { command: "df -h && echo '---' && vm_stat" },
          ],
        },
        {
          direction: "vertical",
          panes: [
            { command: "htop" },
            {
              command:
                "log stream --predicate 'eventMessage contains \"error\"' --info",
            },
          ],
        },
      ],
    },
  },
  {
    name: "DevOps Control Center",
    description: "k9s + lazydocker + kubectl + zsh",
    icon: "Cloud",
    structure: {
      direction: "vertical",
      panes: [
        {
          direction: "horizontal",
          panes: [
            { command: "k9s" }, // Kubernetes TUI
            { command: "lazydocker" }, // Docker TUI
          ],
          size: 70,
        },
        {
          direction: "horizontal",
          panes: [
            { command: "kubectl logs -f deployment/app --tail=50" },
            { command: "zsh" },
          ],
        },
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
