import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
  LocalStorage,
} from "@raycast/api";
import React, { useState, useEffect } from "react";
import { Layout } from "./types";

interface ItemSettings {
  enabled: boolean;
}

interface Props {
  item: Layout | { name: string; description: string; id: string };
  itemType: "template" | "layout";
  onSave?: () => void;
}

export default function ItemSettings({ item, itemType, onSave }: Props) {
  const { pop } = useNavigation();
  const [settings, setSettings] = useState<ItemSettings>({
    enabled: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  const storageKey = `${itemType}-settings-${item.id}`;

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const stored = await LocalStorage.getItem<string>(storageKey);
      if (stored) {
        setSettings(JSON.parse(stored));
      }
    } catch (error) {
      // Failed to load settings
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    try {
      await LocalStorage.setItem(storageKey, JSON.stringify(settings));
      showToast({
        style: Toast.Style.Success,
        title: "Settings saved",
        message: `${settings.enabled ? "Enabled" : "Disabled"} quick launch for ${item.name}`,
      });
      onSave?.();
      pop();
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to save settings",
        message: String(error),
      });
    }
  }

  function updateSetting<K extends keyof ItemSettings>(
    field: K,
    value: ItemSettings[K],
  ) {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Settings"
            icon={Icon.CheckCircle}
            onSubmit={handleSave}
          />
          <Action.Open
            title="Open Raycast Settings"
            icon={Icon.Gear}
            target="raycast://extensions"
          />
        </ActionPanel>
      }
    >
      <Form.Checkbox
        id="enabled"
        title="Enable Quick Launch"
        label={`Show "${item.name}" in search results`}
        value={settings.enabled}
        onChange={(value) => updateSetting("enabled", value)}
        info="When enabled, this item will appear as a searchable command in Raycast"
      />

      {settings.enabled && (
        <>
          <Form.Separator />

          <Form.Description
            title="Set up aliases and shortcuts"
            text={`To configure aliases and keyboard shortcuts for "${item.name}":

1. Save these settings
2. Search for "${item.name}" in Raycast 
3. Press ⌘K on the item
4. Select "Create Alias" or "Create Quicklink"
5. Configure your preferred shortcut

Or click "Open Raycast Settings" above to manage all shortcuts.`}
          />
        </>
      )}

      {!settings.enabled && (
        <Form.Description
          title="Quick Launch Disabled"
          text="Enable quick launch to make this item searchable in Raycast and configure shortcuts."
        />
      )}
    </Form>
  );
}

export async function getItemSettings(
  itemId: string,
  itemType: "template" | "layout",
): Promise<ItemSettings> {
  try {
    const storageKey = `${itemType}-settings-${itemId}`;
    const stored = await LocalStorage.getItem<string>(storageKey);
    return stored ? JSON.parse(stored) : { enabled: false };
  } catch {
    return { enabled: false };
  }
}
