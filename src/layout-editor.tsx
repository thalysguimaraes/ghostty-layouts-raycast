import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import React, { useState } from "react";
import { Layout, Split, Pane } from "./types";
import { saveLayout } from "./layouts";

interface Props {
  layout: Layout;
  onSave: () => void;
}

export default function LayoutEditor({ layout, onSave }: Props) {
  const { pop } = useNavigation();
  const [name, setName] = useState(layout.name);
  const [description, setDescription] = useState(layout.description || "");
  const [rootDirectory, setRootDirectory] = useState(
    layout.rootDirectory || "",
  );
  const [structureJson, setStructureJson] = useState(
    JSON.stringify(layout.structure, null, 2),
  );

  async function handleSave() {
    if (!name.trim()) {
      showToast({
        style: Toast.Style.Failure,
        title: "Name is required",
      });
      return;
    }

    try {
      // Parse and validate the JSON structure
      let parsedStructure;
      try {
        parsedStructure = JSON.parse(structureJson);
        validateStructure(parsedStructure);
      } catch (error) {
        showToast({
          style: Toast.Style.Failure,
          title: "Invalid structure format",
          message:
            error instanceof Error
              ? error.message
              : "Please check your JSON syntax",
        });
        return;
      }

      const updatedLayout: Layout = {
        ...layout,
        name: name.trim(),
        description: description.trim() || undefined,
        rootDirectory: rootDirectory.trim() || undefined,
        structure: parsedStructure,
      };

      await saveLayout(updatedLayout);

      showToast({
        style: Toast.Style.Success,
        title: "Layout saved successfully",
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

  function validateStructure(structure: unknown): asserts structure is Split {
    if (!structure || typeof structure !== "object") {
      throw new Error("Structure must be an object");
    }

    // Root structure must be a Split
    if (!("direction" in structure && "panes" in structure)) {
      throw new Error(
        "Root structure must be a Split with 'direction' and 'panes'",
      );
    }

    if (
      structure.direction !== "vertical" &&
      structure.direction !== "horizontal"
    ) {
      throw new Error("direction must be 'vertical' or 'horizontal'");
    }
    if (!Array.isArray(structure.panes) || structure.panes.length === 0) {
      throw new Error("panes must be a non-empty array");
    }

    // Recursively validate panes
    structure.panes.forEach((pane: unknown, index: number) => {
      try {
        validatePane(pane);
      } catch (error) {
        throw new Error(
          `Invalid pane at index ${index}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  function validatePane(pane: unknown): asserts pane is Pane | Split {
    if (!pane || typeof pane !== "object") {
      throw new Error("Pane must be an object");
    }

    if ("command" in pane) {
      // It's a Pane
      if (typeof pane.command !== "string" || !pane.command.trim()) {
        throw new Error("Pane must have a non-empty command string");
      }
      if (
        (pane as Pane).workingDirectory &&
        typeof (pane as Pane).workingDirectory !== "string"
      ) {
        throw new Error("workingDirectory must be a string");
      }
      if (
        (pane as Pane).size &&
        (typeof (pane as Pane).size !== "number" ||
          (pane as Pane).size! <= 0 ||
          (pane as Pane).size! > 100)
      ) {
        throw new Error("size must be a number between 1 and 100");
      }
    } else if ("direction" in pane && "panes" in pane) {
      // It's a nested Split
      if (pane.direction !== "vertical" && pane.direction !== "horizontal") {
        throw new Error("direction must be 'vertical' or 'horizontal'");
      }
      if (!Array.isArray(pane.panes) || pane.panes.length === 0) {
        throw new Error("panes must be a non-empty array");
      }
      // Recursively validate nested panes
      pane.panes.forEach((nestedPane: unknown, index: number) => {
        try {
          validatePane(nestedPane);
        } catch (error) {
          throw new Error(
            `Invalid nested pane at index ${index}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });
    } else {
      throw new Error(
        "Pane must be either a Pane (with 'command') or a Split (with 'direction' and 'panes')",
      );
    }
  }

  function formatStructure() {
    try {
      const parsed = JSON.parse(structureJson);
      setStructureJson(JSON.stringify(parsed, null, 2));
      showToast({
        style: Toast.Style.Success,
        title: "Structure formatted",
      });
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Invalid JSON",
        message: "Cannot format invalid JSON",
      });
    }
  }

  function resetStructure() {
    setStructureJson(JSON.stringify(layout.structure, null, 2));
    showToast({
      style: Toast.Style.Success,
      title: "Structure reset",
    });
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Layout"
            icon={Icon.CheckCircle}
            onSubmit={handleSave}
          />
          <Action
            title="Format JSON"
            icon={Icon.Code}
            onAction={formatStructure}
          />
          <Action
            title="Reset to Original"
            icon={Icon.ArrowClockwise}
            onAction={resetStructure}
            style={Action.Style.Destructive}
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
        title="Default Root Directory"
        placeholder="~/projects/my-app (optional)"
        value={rootDirectory}
        onChange={setRootDirectory}
        info="This will be used as the default directory when launching the layout"
      />

      <Form.Separator />

      <Form.TextArea
        id="structure"
        title="Layout Structure (JSON)"
        placeholder="Edit the structure JSON..."
        value={structureJson}
        onChange={setStructureJson}
        info="Define your layout structure using JSON. Use 'Format JSON' action to clean up formatting."
      />

      <Form.Description
        title="Structure Guide"
        text={`A structure can be either:
• Pane: {"command": "nvim", "workingDirectory": "./src"}
• Split: {"direction": "vertical", "panes": [...]}

Example vertical split:
{
  "direction": "vertical",
  "panes": [
    {"command": "nvim ."},
    {"command": "zsh"}
  ]
}`}
      />
    </Form>
  );
}
