import { LocalStorage } from "@raycast/api";
import { Layout, LayoutPreset } from "./types";

const STORAGE_KEY = "ghostty-layouts";

// Predefined layout templates with great TUI tools
export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    name: "🚀 Developer Workspace",
    description: "Neovim (main) | File Manager | Git Status | Terminal",
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
    name: "📊 System Monitor",
    description: "Resource Monitor | Process List | System Info | Logs",
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
            { command: "log stream --predicate 'eventMessage contains \"error\"' --info" },
          ],
        },
      ],
    },
  },
  {
    name: "🐳 DevOps Control Center", 
    description: "Kubernetes Dashboard | Docker | Logs | Terminal",
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
  {
    name: "📝 Full Stack Dev",
    description: "Editor | Frontend Server | Backend API | Database",
    structure: {
      direction: "vertical",
      panes: [
        {
          command: "nvim .",
          size: 55,
        },
        {
          direction: "horizontal",
          panes: [
            { command: "npm run dev", workingDirectory: "./frontend" },
            { command: "npm run server", workingDirectory: "./backend" }, 
            { command: "mongosh" }, // MongoDB shell
          ],
        },
      ],
    },
  },
  {
    name: "🔍 Data Explorer",
    description: "Database Client | Query Runner | Results | Analytics",
    structure: {
      direction: "horizontal",
      panes: [
        {
          direction: "vertical",
          panes: [
            { command: "mycli" }, // MySQL CLI with autocomplete
            { command: "redis-cli" },
          ],
        },
        {
          direction: "vertical",
          panes: [
            { command: "nvim queries.sql" },
            { command: "python3 -i -c 'import pandas as pd; import numpy as np'" },
          ],
        },
      ],
    },
  },
  {
    name: "🌐 Network Admin",
    description: "Network Monitor | Connections | Bandwidth | Activity",
    structure: {
      direction: "horizontal",
      panes: [
        {
          direction: "vertical",
          panes: [
            { command: "netstat -rn" }, // macOS routing table
            { command: "lsof -i" }, // Open network connections
          ],
        },
        {
          direction: "vertical",
          panes: [
            { command: "nettop -m route" }, // macOS network top
            { command: "ping 8.8.8.8" }, // Simple connectivity test
          ],
        },
      ],
    },
  },
  {
    name: "⚡ Quick Split",
    description: "Simple vertical split for quick tasks",
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
