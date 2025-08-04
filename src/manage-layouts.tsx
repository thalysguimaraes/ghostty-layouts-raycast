import {
  ActionPanel,
  Action,
  List,
  Icon,
  showToast,
  Toast,
  LocalStorage,
} from "@raycast/api";
import React, { useState, useEffect } from "react";
import { Layout } from "./types";
import {
  getLayouts,
  deleteLayout,
  LAYOUT_PRESETS,
  saveLayout,
} from "./layouts";
import LaunchLayout from "./launch-layout";
import AIBuilderForm from "./ai-builder-form";
import LayoutEditor from "./layout-editor";
import { v4 as uuidv4 } from "uuid";

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

  async function handleUseTemplate(templateName: string, customName?: string) {
    try {
      const preset = LAYOUT_PRESETS.find((p) => p.name === templateName);
      if (!preset) return;

      const layout: Layout = {
        id: uuidv4(),
        name: customName || preset.name,
        description: preset.description,
        structure: preset.structure,
      };

      await saveLayout(layout);
      await loadLayouts();

      showToast({
        style: Toast.Style.Success,
        title: "Template added to your layouts",
      });
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to add template",
      });
    }
  }

  return (
    <List
      isLoading={isLoading}
      navigationTitle="Manage Ghostty Layouts"
      searchBarPlaceholder="Search layouts..."
    >
      {layouts.length === 0 && (
        <List.Section title="Getting Started">
          <List.Item
            title="Keyboard Shortcuts Available"
            subtitle="Go to Raycast Settings → Extensions → Ghostty Layouts to assign hotkeys to template commands"
            icon={Icon.Keyboard}
          />
        </List.Section>
      )}
      
      <List.Section title="My Custom Layouts">
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
                <Action.Push
                  title="Launch Layout"
                  icon={Icon.ArrowRight}
                  target={<LaunchLayout layout={layout} />}
                />
                <Action.Push
                  title="Edit Layout"
                  icon={Icon.Pencil}
                  target={<LayoutEditor layout={layout} onSave={loadLayouts} />}
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

      <List.Section 
        title="Ready-to-Use Templates" 
        subtitle="Templates have their own commands - assign keyboard shortcuts in Raycast Settings"
      >
        {LAYOUT_PRESETS.map((preset) => (
          <List.Item
            key={preset.name}
            title={preset.name}
            subtitle={preset.description}
            icon={
              Icon[preset.icon as keyof typeof Icon] || Icon.AppWindowGrid3x3
            }
            actions={
              <ActionPanel>
                <Action.Push
                  title="Launch Template"
                  icon={Icon.ArrowRight}
                  target={
                    <LaunchLayout
                      layout={{
                        id: "temp-" + preset.name,
                        name: preset.name,
                        description: preset.description,
                        structure: preset.structure,
                      }}
                    />
                  }
                />
                <Action
                  title="Create Custom Layout from Template"
                  icon={Icon.Plus}
                  onAction={() => handleUseTemplate(preset.name)}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title="Create New Layout">
        <List.Item
          title="AI Layout Builder"
          subtitle="Describe your layout in natural language"
          icon={Icon.Wand}
          actions={
            <ActionPanel>
              <Action.Push
                title="Open AI Builder"
                target={<AIBuilderForm onSave={loadLayouts} />}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
