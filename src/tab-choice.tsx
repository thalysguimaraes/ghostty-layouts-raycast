import {
  Action,
  ActionPanel,
  List,
  Icon,
  useNavigation,
} from "@raycast/api";
import React from "react";
import { Layout } from "./types";
import { GhosttyTabInfo } from "./utils";
import RepoPicker from "./repo-picker";

interface Props {
  layout: Layout;
  tabInfo: GhosttyTabInfo;
}

export default function TabChoice({ layout, tabInfo }: Props) {
  const { push } = useNavigation();

  const currentDirDisplay = tabInfo.currentDirectory 
    ? tabInfo.currentDirectory.replace(process.env.HOME || '', '~')
    : "Directory not detected - will use current location";

  const hasDirectory = !!tabInfo.currentDirectory;

  return (
    <List navigationTitle={`Launch ${layout.name}`}>
      <List.Section title="Choose where to launch the layout">
        <List.Item
          title="Use Current Tab"
          subtitle={currentDirDisplay}
          icon={Icon.Terminal}
          accessories={[
            { text: hasDirectory ? "Reuse existing tab" : "Select directory after" }
          ]}
          actions={
            <ActionPanel>
              {hasDirectory ? (
                <Action
                  title="Launch in Current Tab"
                  icon={Icon.ArrowRight}
                  onAction={() => {
                    push(
                      <RepoPicker 
                        layout={layout} 
                        target="current" 
                        useCurrentTab={true}
                        currentDirectory={tabInfo.currentDirectory}
                      />
                    );
                  }}
                />
              ) : (
                <Action
                  title="Select Directory for Current Tab"
                  icon={Icon.Folder}
                  onAction={() => {
                    // Show repo picker but for current tab
                    push(<RepoPicker layout={layout} target="current" />);
                  }}
                />
              )}
            </ActionPanel>
          }
        />
        
        <List.Item
          title="Select Repository"
          subtitle="Choose a different repository"
          icon={Icon.Folder}
          accessories={[{ text: "Create new tab" }]}
          actions={
            <ActionPanel>
              <Action
                title="Select Repository"
                icon={Icon.ArrowRight}
                onAction={() => {
                  push(<RepoPicker layout={layout} target="new-tab" />);
                }}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}