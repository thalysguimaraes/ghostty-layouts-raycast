import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
  closeMainWindow,
  PopToRootType,
} from "@raycast/api";
import React, { useState, useEffect } from "react";
import { Layout } from "./types";
import { launchGhostty, createLayoutStructure, isGhosttyRunning, GhosttyTarget } from "./utils";

interface Props {
  layout: Layout;
}

export default function LaunchLayout({ layout }: Props) {
  const { pop } = useNavigation();
  const [target, setTarget] = useState<GhosttyTarget>("new-window");
  const [isGhosttyActive, setIsGhosttyActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkGhosttyStatus();
  }, []);

  async function checkGhosttyStatus() {
    try {
      const running = await isGhosttyRunning();
      setIsGhosttyActive(running);
      if (running) {
        setTarget("current");
      }
    } catch (error) {
      console.error("Failed to check Ghostty status:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLaunch() {
    try {
      showToast({
        style: Toast.Style.Animated,
        title: "Launching layout...",
        message: layout.name,
      });

      // Close Raycast window first to ensure Ghostty commands don't interfere with Raycast
      await closeMainWindow({ 
        clearRootSearch: false,
        popToRootType: PopToRootType.Suspended 
      });
      
      // Give time for window transition to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await launchGhostty(target);
      
      // Additional delay to ensure Ghostty is ready for layout creation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await createLayoutStructure(layout.structure, layout.rootDirectory);

      showToast({
        style: Toast.Style.Success,
        title: "Layout launched successfully",
        message: layout.name,
      });
    } catch (error) {
      console.error("Layout launch error:", error);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to launch layout",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Launch Layout"
            icon={Icon.ArrowRight}
            onSubmit={handleLaunch}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Layout"
        text={`${layout.name}${layout.description ? ` - ${layout.description}` : ""}`}
      />
      
      {isGhosttyActive && (
        <Form.Description
          title="Status"
          text="Ghostty is currently running"
        />
      )}
      
      <Form.Dropdown
        id="target"
        title="Launch Target"
        value={target}
        onChange={(value) => setTarget(value as GhosttyTarget)}
      >
        {isGhosttyActive && (
          <Form.Dropdown.Item
            value="current"
            title="Current Window/Tab"
            icon={Icon.Terminal}
          />
        )}
        {isGhosttyActive && (
          <Form.Dropdown.Item
            value="new-tab"
            title="New Tab"
            icon={Icon.Plus}
          />
        )}
        <Form.Dropdown.Item
          value="new-window"
          title="New Window"
          icon={Icon.NewDocument}
        />
      </Form.Dropdown>
      
      {layout.rootDirectory && (
        <Form.Description
          title="Working Directory"
          text={layout.rootDirectory}
        />
      )}
    </Form>
  );
}
