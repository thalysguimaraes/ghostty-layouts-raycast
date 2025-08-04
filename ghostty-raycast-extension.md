# Ghostty Layouts - Raycast Extension

This guide will help you create a Raycast extension to manage and launch terminal layout templates for Ghostty.

## Project Setup

1. **Install Raycast CLI tools:**
```bash
npm install -g @raycast/api
```

2. **Create the extension:**
```bash
ray create-ext --name ghostty-layouts --title "Ghostty Layouts"
cd ghostty-layouts
```

3. **Install dependencies:**
```bash
npm install
```

## Extension Structure

```
ghostty-layouts/
├── src/
│   ├── index.tsx           # Main command list
│   ├── launch-layout.tsx   # Launch specific layout
│   ├── create-layout.tsx   # Create new layout
│   ├── types.ts           # TypeScript types
│   ├── layouts.ts         # Layout management
│   └── utils.ts           # Helper functions
├── package.json
├── assets/
│   └── command-icon.png
└── README.md
```

## Implementation

### 1. Types Definition (`src/types.ts`)

```typescript
export interface Pane {
  command: string;
  workingDirectory?: string;
  size?: number; // percentage for splits
}

export interface Split {
  direction: "vertical" | "horizontal";
  panes: (Pane | Split)[];
}

export interface Layout {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  rootDirectory?: string;
  structure: Split;
}

export interface LayoutPreset {
  name: string;
  description: string;
  structure: Split;
}
```

### 2. Layout Management (`src/layouts.ts`)

```typescript
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
```

### 3. Utility Functions (`src/utils.ts`)

```typescript
import { runAppleScript } from "@raycast/utils";
import { Split, Pane } from "./types";

export async function launchGhostty() {
  await runAppleScript('tell application "Ghostty" to activate');
  await delay(500);
}

export async function createSplit(direction: "vertical" | "horizontal") {
  const modifier = direction === "horizontal" ? "{command down, shift down}" : "command down";
  await runAppleScript(
    `tell application "System Events" to keystroke "d" using ${modifier}`
  );
  await delay(200);
}

export async function navigateToPane(direction: "left" | "right" | "up" | "down") {
  const keyCodes = {
    left: "123",
    right: "124",
    up: "126",
    down: "125",
  };
  
  await runAppleScript(
    `tell application "System Events" to key code ${keyCodes[direction]} using command down`
  );
  await delay(100);
}

export async function runCommand(command: string, workingDirectory?: string) {
  let fullCommand = command;
  
  if (workingDirectory) {
    fullCommand = `cd ${workingDirectory} && ${command}`;
  }
  
  await runAppleScript(
    `tell application "System Events" to keystroke "${fullCommand}" & return`
  );
  await delay(100);
}

export async function createLayoutStructure(
  structure: Split | Pane,
  rootDirectory?: string
): Promise<void> {
  if ("command" in structure) {
    // It's a pane
    await runCommand(structure.command, structure.workingDirectory || rootDirectory);
  } else {
    // It's a split
    const { direction, panes } = structure;
    
    for (let i = 0; i < panes.length; i++) {
      if (i > 0) {
        await createSplit(direction);
        
        // Navigate to the new pane
        if (direction === "vertical") {
          await navigateToPane("right");
        } else {
          await navigateToPane("down");
        }
      }
      
      const pane = panes[i];
      
      if ("direction" in pane) {
        // Nested split
        await createLayoutStructure(pane, rootDirectory);
      } else {
        // Simple pane
        await runCommand(pane.command, pane.workingDirectory || rootDirectory);
      }
    }
    
    // Navigate back to first pane
    for (let i = 1; i < panes.length; i++) {
      if (direction === "vertical") {
        await navigateToPane("left");
      } else {
        await navigateToPane("up");
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### 4. Main Command List (`src/index.tsx`)

```tsx
import { ActionPanel, Action, List, Icon, showToast, Toast } from "@raycast/api";
import { useState, useEffect } from "react";
import { Layout } from "./types";
import { getLayouts, deleteLayout } from "./layouts";
import { launchGhostty, createLayoutStructure } from "./utils";
import CreateLayout from "./create-layout";

export default function Command() {
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadLayouts();
  }, []);

  async function loadLayouts() {
    try {
      const stored = await getLayouts();
      setLayouts(stored);
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to load layouts",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLaunch(layout: Layout) {
    try {
      showToast({
        style: Toast.Style.Animated,
        title: "Launching layout",
        message: layout.name,
      });

      await launchGhostty();
      await createLayoutStructure(layout.structure, layout.rootDirectory);

      showToast({
        style: Toast.Style.Success,
        title: "Layout launched",
        message: layout.name,
      });
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to launch layout",
        message: String(error),
      });
    }
  }

  async function handleDelete(layout: Layout) {
    try {
      await deleteLayout(layout.id);
      await loadLayouts();
      
      showToast({
        style: Toast.Style.Success,
        title: "Layout deleted",
      });
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to delete layout",
      });
    }
  }

  return (
    <List isLoading={isLoading}>
      <List.Section title="Custom Layouts">
        {layouts.map((layout) => (
          <List.Item
            key={layout.id}
            title={layout.name}
            subtitle={layout.description}
            icon={layout.icon || Icon.Terminal}
            accessories={[
              { text: layout.rootDirectory || "Current directory" },
            ]}
            actions={
              <ActionPanel>
                <Action
                  title="Launch Layout"
                  icon={Icon.ArrowRight}
                  onAction={() => handleLaunch(layout)}
                />
                <Action.Push
                  title="Edit Layout"
                  icon={Icon.Pencil}
                  target={<CreateLayout layout={layout} onSave={loadLayouts} />}
                />
                <Action
                  title="Delete Layout"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  onAction={() => handleDelete(layout)}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      
      <List.Section title="Actions">
        <List.Item
          title="Create New Layout"
          icon={Icon.Plus}
          actions={
            <ActionPanel>
              <Action.Push
                title="Create Layout"
                target={<CreateLayout onSave={loadLayouts} />}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
```

### 5. Create/Edit Layout Form (`src/create-layout.tsx`)

```tsx
import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState } from "react";
import { Layout } from "./types";
import { saveLayout, LAYOUT_PRESETS } from "./layouts";
import { v4 as uuidv4 } from "uuid";

interface Props {
  layout?: Layout;
  onSave: () => void;
}

export default function CreateLayout({ layout, onSave }: Props) {
  const { pop } = useNavigation();
  const [name, setName] = useState(layout?.name || "");
  const [description, setDescription] = useState(layout?.description || "");
  const [rootDirectory, setRootDirectory] = useState(layout?.rootDirectory || "");
  const [selectedPreset, setSelectedPreset] = useState<string>("");

  async function handleSubmit() {
    if (!name.trim()) {
      showToast({
        style: Toast.Style.Failure,
        title: "Name is required",
      });
      return;
    }

    try {
      const preset = LAYOUT_PRESETS.find((p) => p.name === selectedPreset);
      
      const newLayout: Layout = {
        id: layout?.id || uuidv4(),
        name: name.trim(),
        description: description.trim(),
        rootDirectory: rootDirectory.trim() || undefined,
        structure: preset?.structure || layout?.structure || LAYOUT_PRESETS[0].structure,
      };

      await saveLayout(newLayout);
      
      showToast({
        style: Toast.Style.Success,
        title: layout ? "Layout updated" : "Layout created",
      });

      onSave();
      pop();
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to save layout",
        message: String(error),
      });
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Layout"
            icon={Icon.CheckCircle}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        placeholder="My Development Layout"
        value={name}
        onChange={setName}
      />
      
      <Form.TextField
        id="description"
        title="Description"
        placeholder="Layout for React development"
        value={description}
        onChange={setDescription}
      />
      
      <Form.TextField
        id="rootDirectory"
        title="Root Directory"
        placeholder="~/projects/my-app (optional)"
        value={rootDirectory}
        onChange={setRootDirectory}
      />
      
      {!layout && (
        <Form.Dropdown
          id="preset"
          title="Layout Preset"
          value={selectedPreset}
          onChange={setSelectedPreset}
        >
          {LAYOUT_PRESETS.map((preset) => (
            <Form.Dropdown.Item
              key={preset.name}
              value={preset.name}
              title={preset.name}
            />
          ))}
        </Form.Dropdown>
      )}
      
      <Form.Description
        title="Note"
        text="You can edit the layout structure manually after creation by editing the extension's storage."
      />
    </Form>
  );
}
```

### 6. Package Configuration (`package.json`)

```json
{
  "name": "ghostty-layouts",
  "title": "Ghostty Layouts",
  "description": "Manage and launch terminal layout templates for Ghostty",
  "icon": "command-icon.png",
  "author": "your-name",
  "license": "MIT",
  "commands": [
    {
      "name": "index",
      "title": "Manage Ghostty Layouts",
      "subtitle": "Create and launch terminal layouts",
      "description": "Manage your Ghostty terminal layout templates",
      "mode": "view"
    }
  ],
  "dependencies": {
    "@raycast/api": "^1.64.0",
    "@raycast/utils": "^1.10.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@raycast/eslint-config": "^1.0.5",
    "@types/node": "20.8.10",
    "@types/react": "18.2.27",
    "@types/uuid": "^9.0.0",
    "eslint": "^8.51.0",
    "prettier": "^3.0.3",
    "typescript": "^5.2.2"
  },
  "scripts": {
    "build": "ray build -e dist",
    "dev": "ray develop",
    "fix-lint": "ray lint --fix",
    "lint": "ray lint"
  }
}
```

## Installation & Usage

1. **Build and run in development:**
```bash
npm run dev
```

2. **Build for production:**
```bash
npm run build
```

3. **Import to Raycast:**
   - Open Raycast
   - Search for "Import Extension"
   - Select your `ghostty-layouts` folder

## Features

- **Predefined Templates**: Quick access to common layout patterns
- **Custom Layouts**: Create and save your own layouts
- **Directory Support**: Set working directories for each pane
- **Edit & Delete**: Manage your saved layouts
- **Quick Launch**: Launch layouts with a single command

## Future Enhancements

1. **Visual Layout Builder**: Add a visual interface to create layouts
2. **Import/Export**: Share layouts with others
3. **Project Detection**: Auto-detect project type and suggest layouts
4. **Multiple Windows**: Support for multi-window layouts
5. **Preferences**: Add user preferences for default directories, commands, etc.
6. **Quick Actions**: Add keyboard shortcuts for frequently used layouts

## Tips

- Use descriptive names for your layouts
- Set root directories to quickly navigate to project folders
- Create project-specific layouts for different tech stacks
- Use the preset layouts as starting points and customize them

This extension provides a much better experience than simple scripts, with proper UI feedback, error handling, and layout management capabilities.