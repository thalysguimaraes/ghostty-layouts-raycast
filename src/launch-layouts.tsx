import { Action, ActionPanel, Icon, List } from "@raycast/api";
import React, { useEffect, useState } from "react";
import { getLayouts, LAYOUT_PRESETS } from "./layouts";
import { Layout, LayoutPreset } from "./types";
import LaunchLayout from "./launch-layout";
import RepoSearch from "./repo-search";

function toTemplateLayout(preset: LayoutPreset): Layout {
  return {
    id: `temp-${preset.name}`,
    name: preset.name,
    description: preset.description,
    structure: preset.structure,
  };
}

function LaunchActions({ layout }: { layout: Layout }) {
  return (
    <ActionPanel>
      <Action.Push
        title="Launch Layout"
        icon={Icon.ArrowRight}
        target={<LaunchLayout layout={layout} />}
      />
      <Action.Push
        title="Launch in Current Tab"
        icon={Icon.Terminal}
        target={<LaunchLayout layout={layout} target="current" />}
      />
      <Action.Push
        title="Launch in New Tab"
        icon={Icon.AppWindowGrid3x3}
        target={<LaunchLayout layout={layout} target="new-tab" />}
      />
      <Action.Push
        title="Launch in New Window"
        icon={Icon.AppWindowGrid3x3}
        target={<LaunchLayout layout={layout} target="new-window" />}
      />
      {layout.rootDirectory && (
        <Action.Push
          title="Launch in Default Directory"
          icon={Icon.Folder}
          target={
            <LaunchLayout
              layout={layout}
              preferredRepoPath={layout.rootDirectory}
            />
          }
        />
      )}
      <Action.Push
        title="Pick Repository"
        icon={Icon.Folder}
        target={<RepoSearch layout={layout} target="new-tab" />}
      />
    </ActionPanel>
  );
}

export default function LaunchLayoutsCommand() {
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const storedLayouts = await getLayouts();
      setLayouts(storedLayouts);
      setIsLoading(false);
    }

    void load();
  }, []);

  return (
    <List
      isLoading={isLoading}
      navigationTitle="Launch Ghostty Layout"
      searchBarPlaceholder="Search layouts and templates..."
    >
      <List.Section title="My Layouts">
        {layouts.map((layout) => (
          <List.Item
            key={layout.id}
            title={layout.name}
            subtitle={layout.description}
            icon={layout.icon || Icon.Terminal}
            accessories={
              layout.rootDirectory ? [{ text: layout.rootDirectory }] : []
            }
            actions={<LaunchActions layout={layout} />}
          />
        ))}
      </List.Section>

      <List.Section title="Templates">
        {LAYOUT_PRESETS.map((preset) => {
          const layout = toTemplateLayout(preset);

          return (
            <List.Item
              key={preset.name}
              title={preset.name}
              subtitle={preset.description}
              icon={
                Icon[preset.icon as keyof typeof Icon] || Icon.AppWindowGrid3x3
              }
              actions={<LaunchActions layout={layout} />}
            />
          );
        })}
      </List.Section>
    </List>
  );
}
