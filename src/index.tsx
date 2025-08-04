import { ActionPanel, Action, List, Icon, showToast, Toast } from "@raycast/api";
import React, { useState, useEffect } from "react";
import { Layout } from "./types";
import { getLayouts, deleteLayout } from "./layouts";
import CreateLayout from "./create-layout";
import LaunchLayout from "./launch-layout";
import AIBuilder from "./ai-builder";

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
                <Action.Push
                  title="Launch Layout"
                  icon={Icon.ArrowRight}
                  target={<LaunchLayout layout={layout} />}
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
          subtitle="Quick form-based creation"
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
        <List.Item
          title="AI Layout Builder"
          subtitle="Describe your layout in natural language"
          icon={Icon.Wand}
          actions={
            <ActionPanel>
              <Action.Push
                title="Open AI Builder"
                target={<AIBuilder onSave={loadLayouts} />}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
