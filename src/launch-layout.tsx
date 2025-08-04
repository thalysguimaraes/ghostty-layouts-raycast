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
import RepoPicker from "./repo-picker";

interface Props {
  layout: Layout;
}

export default function LaunchLayout({ layout }: Props) {
  const { pop, push } = useNavigation();
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
    // If using current tab, launch directly (uses current working directory)
    if (target === "current") {
      return launchInCurrentDirectory();
    }
    
    // For new tab/window, show repo picker
    push(<RepoPicker layout={layout} target={target} />);
  }

  async function launchInCurrentDirectory() {
    try {
      showToast({
        style: Toast.Style.Animated,
        title: "Launching layout...",
        message: `${layout.name} in current directory`,
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
      
      // Use current directory (don't specify rootDirectory)
      await createLayoutStructure(layout.structure);

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
      
      <Form.Description
        title="Working Directory"
        text={target === "current" ? "Will use the current working directory of your active terminal" : "You'll be prompted to select a repository from your developer folder"}
      />
      
      <Form.Dropdown
        id="target"
        title="Launch Target"
        value={target}
        onChange={(value) => setTarget(value as GhosttyTarget)}
      >
        {isGhosttyActive && (
          <Form.Dropdown.Item
            value="current"
            title="Current Window/Tab (use current directory)"
            icon={Icon.Terminal}
          />
        )}
        {isGhosttyActive && (
          <Form.Dropdown.Item
            value="new-tab"
            title="New Tab (select repository)"
            icon={Icon.Plus}
          />
        )}
        <Form.Dropdown.Item
          value="new-window"
          title="New Window (select repository)"
          icon={Icon.NewDocument}
        />
      </Form.Dropdown>
    </Form>
  );
}
