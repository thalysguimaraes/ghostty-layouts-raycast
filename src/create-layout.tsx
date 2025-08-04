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
