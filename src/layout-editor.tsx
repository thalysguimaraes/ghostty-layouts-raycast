import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import React, { useEffect, useMemo, useState } from "react";
import { saveLayout } from "./layouts";
import { Layout, Pane, Split } from "./types";
import {
  isSplitNode,
  parseLayoutStructureJson,
  validateLayoutStructure,
} from "./domain/schema";
import {
  addCustomNodeTemplate,
  CustomNodeTemplate,
  exportCustomNodeTemplates,
  getCustomNodeTemplates,
  importCustomNodeTemplates,
  removeCustomNodeTemplate,
} from "./services/template-library";

interface Props {
  layout: Layout;
  onSave: () => void;
}

interface NodeEntry {
  path: number[];
  depth: number;
  node: Pane | Split;
}

interface MetadataEditorProps {
  layout: Layout;
  onSubmit: (next: {
    name: string;
    description: string;
    rootDirectory: string;
  }) => void;
}

interface PaneEditorProps {
  pane: Pane;
  onSubmit: (nextPane: Pane) => void;
}

interface SplitEditorProps {
  split: Split;
  onSubmit: (nextSplit: Split) => void;
}

interface JsonStructureEditorProps {
  initialStructure: Split;
  onSubmit: (nextStructure: Split) => void;
}

interface SaveTemplateFormProps {
  defaultTitle: string;
  onSubmit: (title: string) => void;
}

interface NodeTemplate {
  id: string;
  title: string;
  icon: Icon;
  node: Pane | Split;
}

const DEFAULT_PANE: Pane = { command: "zsh" };
const DEFAULT_SPLIT: Split = {
  direction: "vertical",
  panes: [{ command: "zsh" }, { command: "zsh" }],
};

const PANE_TEMPLATES: NodeTemplate[] = [
  {
    id: "pane-shell",
    title: "Shell",
    icon: Icon.Terminal,
    node: { command: "zsh" },
  },
  {
    id: "pane-editor",
    title: "Editor",
    icon: Icon.Pencil,
    node: { command: "nvim ." },
  },
  {
    id: "pane-dev-server",
    title: "Dev Server",
    icon: Icon.Rocket,
    node: { command: "npm run dev" },
  },
  {
    id: "pane-git",
    title: "Git",
    icon: Icon.Code,
    node: { command: "lazygit" },
  },
  {
    id: "pane-tests",
    title: "Tests",
    icon: Icon.Checkmark,
    node: { command: "npm test -- --watch" },
  },
];

const SPLIT_TEMPLATES: NodeTemplate[] = [
  {
    id: "split-editor-terminal",
    title: "Editor + Terminal",
    icon: Icon.AppWindowGrid3x3,
    node: {
      direction: "horizontal",
      panes: [{ command: "nvim ." }, { command: "zsh" }],
    },
  },
  {
    id: "split-fullstack",
    title: "Full-stack",
    icon: Icon.AppWindowGrid3x3,
    node: {
      direction: "vertical",
      panes: [
        { command: "nvim ." },
        {
          direction: "horizontal",
          panes: [{ command: "npm run dev" }, { command: "npm run backend" }],
        },
      ],
    },
  },
  {
    id: "split-ops",
    title: "Ops Split",
    icon: Icon.AppWindowGrid3x3,
    node: {
      direction: "horizontal",
      panes: [{ command: "docker ps" }, { command: "kubectl get pods -A" }],
    },
  },
];

function cloneStructure(structure: Split): Split {
  return JSON.parse(JSON.stringify(structure)) as Split;
}

function cloneNode(node: Pane | Split): Pane | Split {
  return JSON.parse(JSON.stringify(node)) as Pane | Split;
}

function cloneLayoutDraft(layout: Layout): Layout {
  return {
    ...layout,
    structure: cloneStructure(layout.structure),
  };
}

function flattenNodes(
  node: Pane | Split,
  path: number[] = [],
  depth = 0,
): NodeEntry[] {
  const current: NodeEntry = {
    path,
    depth,
    node,
  };

  if (!isSplitNode(node)) {
    return [current];
  }

  const children = node.panes.flatMap((pane, index) =>
    flattenNodes(pane, [...path, index], depth + 1),
  );

  return [current, ...children];
}

function updateNodeAtPath(
  structure: Split,
  path: number[],
  updater: (node: Pane | Split) => Pane | Split,
): Split {
  const apply = (node: Pane | Split, remainingPath: number[]): Pane | Split => {
    if (remainingPath.length === 0) {
      return updater(node);
    }

    if (!isSplitNode(node)) {
      throw new Error("Cannot traverse into pane node");
    }

    const [index, ...tail] = remainingPath;
    if (index < 0 || index >= node.panes.length) {
      throw new Error("Invalid node path");
    }

    return {
      ...node,
      panes: node.panes.map((pane, paneIndex) =>
        paneIndex === index ? apply(pane, tail) : pane,
      ),
    };
  };

  const updatedRoot = apply(structure, path);

  if (!isSplitNode(updatedRoot)) {
    throw new Error("Root structure must stay a split");
  }

  return updatedRoot;
}

function getNodeAtPath(structure: Split, path: number[]): Pane | Split {
  let current: Pane | Split = structure;

  for (const index of path) {
    if (!isSplitNode(current) || index < 0 || index >= current.panes.length) {
      throw new Error("Invalid node path");
    }

    current = current.panes[index];
  }

  return current;
}

function addChildNodeAtPath(
  structure: Split,
  path: number[],
  child: Pane | Split,
): Split {
  return updateNodeAtPath(structure, path, (node) => {
    if (!isSplitNode(node)) {
      throw new Error("Cannot add a child to a pane");
    }

    return {
      ...node,
      panes: [...node.panes, child],
    };
  });
}

function removeNodeAtPath(structure: Split, path: number[]): Split {
  if (path.length === 0) {
    throw new Error("Cannot remove the root split");
  }

  const parentPath = path.slice(0, -1);
  const removeIndex = path[path.length - 1];

  return updateNodeAtPath(structure, parentPath, (node) => {
    if (!isSplitNode(node)) {
      throw new Error("Parent node is not a split");
    }

    if (node.panes.length <= 1) {
      throw new Error("A split must contain at least one pane");
    }

    return {
      ...node,
      panes: node.panes.filter((_, paneIndex) => paneIndex !== removeIndex),
    };
  });
}

function moveNodeAtPath(
  structure: Split,
  path: number[],
  direction: "up" | "down",
): Split {
  if (path.length === 0) {
    throw new Error("Cannot move the root split");
  }

  const parentPath = path.slice(0, -1);
  const currentIndex = path[path.length - 1];
  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  return updateNodeAtPath(structure, parentPath, (node) => {
    if (!isSplitNode(node)) {
      throw new Error("Parent node is not a split");
    }

    if (nextIndex < 0 || nextIndex >= node.panes.length) {
      throw new Error(
        direction === "up"
          ? "Node is already at top"
          : "Node is already at bottom",
      );
    }

    const panes = [...node.panes];
    const [moved] = panes.splice(currentIndex, 1);
    panes.splice(nextIndex, 0, moved);

    return {
      ...node,
      panes,
    };
  });
}

function getMoveAvailability(
  structure: Split,
  path: number[],
): { canMoveUp: boolean; canMoveDown: boolean } {
  if (path.length === 0) {
    return { canMoveUp: false, canMoveDown: false };
  }

  const parentPath = path.slice(0, -1);
  const currentIndex = path[path.length - 1];
  const parentNode = getNodeAtPath(structure, parentPath);

  if (!isSplitNode(parentNode)) {
    return { canMoveUp: false, canMoveDown: false };
  }

  return {
    canMoveUp: currentIndex > 0,
    canMoveDown: currentIndex < parentNode.panes.length - 1,
  };
}

function formatNodePath(path: number[]): string {
  if (path.length === 0) {
    return "root";
  }

  return path.map((index) => index + 1).join(".");
}

function formatNodeBreadcrumb(path: number[]): string {
  if (path.length === 0) {
    return "root";
  }

  return `root > ${path.map((index) => index + 1).join(" > ")}`;
}

function iconForNode(node: Pane | Split): Icon {
  if (isSplitNode(node)) {
    return Icon.AppWindowGrid3x3;
  }

  return Icon.Terminal;
}

function toNodeTemplate(template: CustomNodeTemplate): NodeTemplate {
  return {
    id: `custom-${template.id}`,
    title: template.title,
    icon: iconForNode(template.node),
    node: template.node,
  };
}

function renderStructurePreview(node: Pane | Split, depth = 0): string {
  const indent = "  ".repeat(depth);

  if (!isSplitNode(node)) {
    const directorySuffix = node.workingDirectory
      ? ` (${node.workingDirectory})`
      : "";
    return `${indent}- pane: \`${node.command}\`${directorySuffix}`;
  }

  const head = `${indent}- split: ${node.direction}`;
  const children = node.panes.map((pane) =>
    renderStructurePreview(pane, depth + 1),
  );
  return [head, ...children].join("\n");
}

function MetadataEditor({ layout, onSubmit }: MetadataEditorProps) {
  const { pop } = useNavigation();
  const [name, setName] = useState(layout.name);
  const [description, setDescription] = useState(layout.description ?? "");
  const [rootDirectory, setRootDirectory] = useState(
    layout.rootDirectory ?? "",
  );

  async function handleSubmit() {
    if (!name.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Name is required",
      });
      return;
    }

    onSubmit({
      name: name.trim(),
      description: description.trim(),
      rootDirectory: rootDirectory.trim(),
    });

    pop();
  }

  return (
    <Form
      navigationTitle="Edit Metadata"
      actions={
        <ActionPanel>
          <Action
            title="Apply Changes"
            icon={Icon.CheckCircle}
            onAction={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" value={name} onChange={setName} />
      <Form.TextField
        id="description"
        title="Description"
        value={description}
        onChange={setDescription}
      />
      <Form.TextField
        id="rootDirectory"
        title="Default Root Directory"
        value={rootDirectory}
        onChange={setRootDirectory}
        placeholder="~/Developer/my-project"
      />
    </Form>
  );
}

function PaneEditor({ pane, onSubmit }: PaneEditorProps) {
  const { pop } = useNavigation();
  const [command, setCommand] = useState(pane.command);
  const [workingDirectory, setWorkingDirectory] = useState(
    pane.workingDirectory ?? "",
  );
  const [size, setSize] = useState(pane.size ? String(pane.size) : "");

  async function handleSubmit() {
    if (!command.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Command is required",
      });
      return;
    }

    let parsedSize: number | undefined;
    if (size.trim()) {
      parsedSize = Number(size);
      if (Number.isNaN(parsedSize) || parsedSize <= 0 || parsedSize > 100) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Invalid pane size",
          message: "Use a number between 1 and 100",
        });
        return;
      }
    }

    onSubmit({
      command: command.trim(),
      workingDirectory: workingDirectory.trim() || undefined,
      size: parsedSize,
    });

    pop();
  }

  return (
    <Form
      navigationTitle="Edit Pane"
      actions={
        <ActionPanel>
          <Action
            title="Apply Changes"
            icon={Icon.CheckCircle}
            onAction={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="command"
        title="Command"
        value={command}
        onChange={setCommand}
      />
      <Form.TextField
        id="workingDirectory"
        title="Working Directory"
        value={workingDirectory}
        onChange={setWorkingDirectory}
        placeholder="./src"
      />
      <Form.TextField
        id="size"
        title="Size (%)"
        value={size}
        onChange={setSize}
        placeholder="70"
      />
    </Form>
  );
}

function SplitEditor({ split, onSubmit }: SplitEditorProps) {
  const { pop } = useNavigation();
  const [direction, setDirection] = useState<Split["direction"]>(
    split.direction,
  );

  function handleSubmit() {
    onSubmit({
      ...split,
      direction,
    });
    pop();
  }

  return (
    <Form
      navigationTitle="Edit Split"
      actions={
        <ActionPanel>
          <Action
            title="Apply Changes"
            icon={Icon.CheckCircle}
            onAction={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="direction"
        title="Direction"
        value={direction}
        onChange={(value) => setDirection(value as Split["direction"])}
      >
        <Form.Dropdown.Item value="vertical" title="Vertical" />
        <Form.Dropdown.Item value="horizontal" title="Horizontal" />
      </Form.Dropdown>
      <Form.Description
        title="Children"
        text={`This split has ${split.panes.length} pane${split.panes.length === 1 ? "" : "s"}.`}
      />
    </Form>
  );
}

function JsonStructureEditor({
  initialStructure,
  onSubmit,
}: JsonStructureEditorProps) {
  const { pop } = useNavigation();
  const [value, setValue] = useState(JSON.stringify(initialStructure, null, 2));

  async function handleSubmit() {
    try {
      const nextStructure = parseLayoutStructureJson(value);
      onSubmit(nextStructure);
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid JSON structure",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleFormat() {
    try {
      const nextStructure = parseLayoutStructureJson(value);
      setValue(JSON.stringify(nextStructure, null, 2));
      await showToast({
        style: Toast.Style.Success,
        title: "Structure formatted",
      });
    } catch {
      await showToast({
        style: Toast.Style.Failure,
        title: "Cannot format invalid JSON",
      });
    }
  }

  return (
    <Form
      navigationTitle="Edit as JSON"
      actions={
        <ActionPanel>
          <Action
            title="Apply JSON"
            icon={Icon.CheckCircle}
            onAction={handleSubmit}
          />
          <Action
            title="Format JSON"
            icon={Icon.Code}
            onAction={handleFormat}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="structure"
        title="Layout Structure JSON"
        value={value}
        onChange={setValue}
      />
    </Form>
  );
}

function SaveTemplateForm({ defaultTitle, onSubmit }: SaveTemplateFormProps) {
  const { pop } = useNavigation();
  const [title, setTitle] = useState(defaultTitle);

  async function handleSubmit() {
    if (!title.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Template name is required",
      });
      return;
    }

    onSubmit(title.trim());
    pop();
  }

  return (
    <Form
      navigationTitle="Save Custom Template"
      actions={
        <ActionPanel>
          <Action
            title="Save Template"
            icon={Icon.CheckCircle}
            onAction={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="template-title"
        title="Template Name"
        value={title}
        onChange={setTitle}
      />
    </Form>
  );
}

export default function LayoutEditor({ layout, onSave }: Props) {
  const { push, pop } = useNavigation();
  const [draftLayout, setDraftLayout] = useState<Layout>(
    cloneLayoutDraft(layout),
  );
  const [depthFilter, setDepthFilter] = useState("all");
  const [pastDrafts, setPastDrafts] = useState<Layout[]>([]);
  const [futureDrafts, setFutureDrafts] = useState<Layout[]>([]);
  const [customTemplates, setCustomTemplates] = useState<CustomNodeTemplate[]>(
    [],
  );

  const canUndo = pastDrafts.length > 0;
  const canRedo = futureDrafts.length > 0;

  const customTemplateEntries: NodeTemplate[] = useMemo(
    () => customTemplates.map((template) => toNodeTemplate(template)),
    [customTemplates],
  );

  const structureEntries = useMemo(
    () => flattenNodes(draftLayout.structure),
    [draftLayout.structure],
  );

  const maxDepth = useMemo(
    () => Math.max(...structureEntries.map((entry) => entry.depth), 0),
    [structureEntries],
  );

  async function refreshCustomTemplates() {
    const storedTemplates = await getCustomNodeTemplates();
    setCustomTemplates(storedTemplates);
  }

  useEffect(() => {
    if (depthFilter !== "all" && Number(depthFilter) > maxDepth) {
      setDepthFilter("all");
    }
  }, [depthFilter, maxDepth]);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomTemplates() {
      const storedTemplates = await getCustomNodeTemplates();

      if (!cancelled) {
        setCustomTemplates(storedTemplates);
      }
    }

    void loadCustomTemplates();

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleEntries = useMemo(() => {
    if (depthFilter === "all") {
      return structureEntries;
    }

    const numericDepth = Number(depthFilter);
    if (Number.isNaN(numericDepth)) {
      return structureEntries;
    }

    return structureEntries.filter((entry) => entry.depth <= numericDepth);
  }, [depthFilter, structureEntries]);

  const previewMarkdown = useMemo(
    () =>
      [
        `# ${draftLayout.name}`,
        renderStructurePreview(draftLayout.structure),
      ].join("\n\n"),
    [draftLayout.name, draftLayout.structure],
  );

  function applyDraftChange(updater: (previous: Layout) => Layout) {
    setDraftLayout((previous) => {
      const nextDraft = cloneLayoutDraft(updater(previous));

      if (JSON.stringify(previous) === JSON.stringify(nextDraft)) {
        return previous;
      }

      setPastDrafts((past) => [...past, cloneLayoutDraft(previous)].slice(-60));
      setFutureDrafts([]);

      return nextDraft;
    });
  }

  async function updateStructure(updater: (current: Split) => Split) {
    applyDraftChange((previous) => ({
      ...previous,
      structure: updater(previous.structure),
    }));
  }

  function handleUndo() {
    if (!canUndo) {
      return;
    }

    const previousDraft = pastDrafts[pastDrafts.length - 1];
    setPastDrafts((past) => past.slice(0, -1));
    setFutureDrafts((future) => [cloneLayoutDraft(draftLayout), ...future]);
    setDraftLayout(cloneLayoutDraft(previousDraft));
  }

  function handleRedo() {
    if (!canRedo) {
      return;
    }

    const [nextDraft, ...remainingFuture] = futureDrafts;
    setFutureDrafts(remainingFuture);
    setPastDrafts((past) =>
      [...past, cloneLayoutDraft(draftLayout)].slice(-60),
    );
    setDraftLayout(cloneLayoutDraft(nextDraft));
  }

  async function handleSaveCustomTemplate(node: Pane | Split, title: string) {
    try {
      await addCustomNodeTemplate(title, cloneNode(node));
      await refreshCustomTemplates();
      await showToast({
        style: Toast.Style.Success,
        title: "Custom template saved",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to save template",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleDeleteCustomTemplate(templateId: string) {
    try {
      await removeCustomNodeTemplate(templateId);
      await refreshCustomTemplates();
      await showToast({
        style: Toast.Style.Success,
        title: "Custom template removed",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to remove template",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleSaveLayout() {
    if (!draftLayout.name.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Name is required",
      });
      return;
    }

    try {
      validateLayoutStructure(draftLayout.structure);

      await saveLayout({
        ...draftLayout,
        name: draftLayout.name.trim(),
        description: draftLayout.description?.trim() || undefined,
        rootDirectory: draftLayout.rootDirectory?.trim() || undefined,
      });

      await showToast({
        style: Toast.Style.Success,
        title: "Layout saved successfully",
      });

      onSave();
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to save layout",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleExportStructure() {
    await Clipboard.copy(JSON.stringify(draftLayout.structure, null, 2));
    await showToast({
      style: Toast.Style.Success,
      title: "Structure copied to clipboard",
    });
  }

  async function handleImportStructure() {
    const clipboardText = await Clipboard.readText();

    if (!clipboardText) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Clipboard is empty",
      });
      return;
    }

    try {
      const importedStructure = parseLayoutStructureJson(clipboardText);
      await updateStructure(() => importedStructure);
      await showToast({
        style: Toast.Style.Success,
        title: "Structure imported",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid clipboard JSON",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleExportCustomTemplates() {
    const payload = await exportCustomNodeTemplates();
    await Clipboard.copy(payload);
    await showToast({
      style: Toast.Style.Success,
      title: "Custom templates copied",
      message: `${customTemplates.length} template${customTemplates.length === 1 ? "" : "s"}`,
    });
  }

  async function handleImportCustomTemplates(mode: "merge" | "replace") {
    const clipboardText = await Clipboard.readText();

    if (!clipboardText) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Clipboard is empty",
      });
      return;
    }

    try {
      const result = await importCustomNodeTemplates(clipboardText, { mode });
      await refreshCustomTemplates();
      await showToast({
        style: Toast.Style.Success,
        title:
          mode === "replace"
            ? "Custom templates replaced"
            : "Custom templates imported",
        message: `${result.imported} imported • ${result.total} total`,
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to import templates",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleRemoveNode(path: number[]) {
    try {
      await updateStructure((current) => removeNodeAtPath(current, path));
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to remove node",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleAddPane(path: number[]) {
    try {
      await updateStructure((current) =>
        addChildNodeAtPath(current, path, { ...DEFAULT_PANE }),
      );
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to add pane",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleAddSplit(path: number[]) {
    try {
      await updateStructure((current) =>
        addChildNodeAtPath(current, path, cloneStructure(DEFAULT_SPLIT)),
      );
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to add split",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleMoveNode(path: number[], direction: "up" | "down") {
    try {
      await updateStructure((current) =>
        moveNodeAtPath(current, path, direction),
      );
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to move node",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleAddTemplate(path: number[], template: NodeTemplate) {
    try {
      await updateStructure((current) =>
        addChildNodeAtPath(current, path, cloneNode(template.node)),
      );
      await showToast({
        style: Toast.Style.Success,
        title: `Added ${template.title}`,
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to add template",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function pushNodeEditor(entry: NodeEntry) {
    if (isSplitNode(entry.node)) {
      push(
        <SplitEditor
          split={entry.node}
          onSubmit={(nextSplit) => {
            applyDraftChange((previous) => ({
              ...previous,
              structure: updateNodeAtPath(
                previous.structure,
                entry.path,
                () => nextSplit,
              ),
            }));
          }}
        />,
      );
      return;
    }

    push(
      <PaneEditor
        pane={entry.node}
        onSubmit={(nextPane) => {
          applyDraftChange((previous) => ({
            ...previous,
            structure: updateNodeAtPath(
              previous.structure,
              entry.path,
              () => nextPane,
            ),
          }));
        }}
      />,
    );
  }

  return (
    <List
      navigationTitle={`Edit ${draftLayout.name}`}
      searchBarPlaceholder="Search nodes..."
      searchBarAccessory={
        <List.Dropdown
          tooltip="Visible Depth"
          value={depthFilter}
          onChange={setDepthFilter}
          storeValue
        >
          <List.Dropdown.Item title="All Depths" value="all" />
          {Array.from({ length: maxDepth + 1 }, (_, depth) => (
            <List.Dropdown.Item
              key={`depth-${depth}`}
              title={`Up to Depth ${depth}`}
              value={String(depth)}
            />
          ))}
        </List.Dropdown>
      }
    >
      <List.Section title="Overview">
        <List.Item
          title={draftLayout.name}
          subtitle={draftLayout.description || "No description"}
          icon={Icon.AppWindowGrid3x3}
          accessories={[
            {
              text: draftLayout.rootDirectory || "No root directory",
            },
          ]}
          detail={<List.Item.Detail markdown={previewMarkdown} />}
          actions={
            <ActionPanel>
              <Action
                title="Save Layout"
                icon={Icon.CheckCircle}
                onAction={handleSaveLayout}
              />
              {canUndo && (
                <Action
                  title="Undo"
                  icon={Icon.ArrowLeft}
                  shortcut={{ modifiers: ["cmd"], key: "z" }}
                  onAction={handleUndo}
                />
              )}
              {canRedo && (
                <Action
                  title="Redo"
                  icon={Icon.ArrowRight}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "z" }}
                  onAction={handleRedo}
                />
              )}
              <Action.Push
                title="Edit Metadata"
                icon={Icon.Pencil}
                target={
                  <MetadataEditor
                    layout={draftLayout}
                    onSubmit={(next) => {
                      applyDraftChange((previous) => ({
                        ...previous,
                        name: next.name,
                        description: next.description || undefined,
                        rootDirectory: next.rootDirectory || undefined,
                      }));
                    }}
                  />
                }
              />
              <Action.Push
                title="Edit Structure as JSON"
                icon={Icon.Code}
                target={
                  <JsonStructureEditor
                    initialStructure={draftLayout.structure}
                    onSubmit={(nextStructure) => {
                      applyDraftChange((previous) => ({
                        ...previous,
                        structure: nextStructure,
                      }));
                    }}
                  />
                }
              />
              <Action
                title="Import JSON from Clipboard"
                icon={Icon.Clipboard}
                onAction={handleImportStructure}
              />
              <Action
                title="Export JSON to Clipboard"
                icon={Icon.CopyClipboard}
                onAction={handleExportStructure}
              />
              <ActionPanel.Submenu
                title="Custom Template Library"
                icon={Icon.Book}
              >
                <Action
                  title="Export Custom Templates"
                  icon={Icon.CopyClipboard}
                  onAction={() => void handleExportCustomTemplates()}
                />
                <Action
                  title="Merge Custom Templates from Clipboard"
                  icon={Icon.Download}
                  onAction={() => void handleImportCustomTemplates("merge")}
                />
                <Action
                  title="Replace Custom Templates from Clipboard"
                  icon={Icon.Upload}
                  style={Action.Style.Destructive}
                  onAction={() => void handleImportCustomTemplates("replace")}
                />
              </ActionPanel.Submenu>
              <Action.Push
                title="Save Root as Custom Template"
                icon={Icon.PlusCircle}
                target={
                  <SaveTemplateForm
                    defaultTitle={`${draftLayout.name} Root`}
                    onSubmit={(title) => {
                      void handleSaveCustomTemplate(
                        draftLayout.structure,
                        title,
                      );
                    }}
                  />
                }
              />
              <ActionPanel.Submenu
                title="Add Root Template"
                icon={Icon.PlusCircle}
              >
                {PANE_TEMPLATES.map((template) => (
                  <Action
                    key={template.id}
                    title={`Add ${template.title} Pane`}
                    icon={template.icon}
                    onAction={() => void handleAddTemplate([], template)}
                  />
                ))}
                {SPLIT_TEMPLATES.map((template) => (
                  <Action
                    key={template.id}
                    title={`Add ${template.title}`}
                    icon={template.icon}
                    onAction={() => void handleAddTemplate([], template)}
                  />
                ))}
                {customTemplateEntries.map((template) => (
                  <Action
                    key={template.id}
                    title={`Add ${template.title}`}
                    icon={template.icon}
                    onAction={() => void handleAddTemplate([], template)}
                  />
                ))}
              </ActionPanel.Submenu>
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title="Custom Templates">
        {customTemplates.map((template) => (
          <List.Item
            key={template.id}
            title={template.title}
            subtitle={
              isSplitNode(template.node) ? "Split template" : "Pane template"
            }
            icon={iconForNode(template.node)}
            actions={
              <ActionPanel>
                <Action
                  title="Add Template to Root"
                  icon={Icon.Plus}
                  onAction={() =>
                    void handleAddTemplate([], toNodeTemplate(template))
                  }
                />
                <Action
                  title="Export Custom Templates"
                  icon={Icon.CopyClipboard}
                  onAction={() => void handleExportCustomTemplates()}
                />
                <Action
                  title="Merge Custom Templates from Clipboard"
                  icon={Icon.Download}
                  onAction={() => void handleImportCustomTemplates("merge")}
                />
                <Action
                  title="Replace Custom Templates from Clipboard"
                  icon={Icon.Upload}
                  style={Action.Style.Destructive}
                  onAction={() => void handleImportCustomTemplates("replace")}
                />
                <Action
                  title="Delete Template"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  onAction={() => void handleDeleteCustomTemplate(template.id)}
                />
              </ActionPanel>
            }
          />
        ))}

        {customTemplates.length === 0 && (
          <List.Item
            title="No custom templates yet"
            subtitle="Save a node as template or import from clipboard"
            icon={Icon.Book}
            actions={
              <ActionPanel>
                <Action
                  title="Merge Custom Templates from Clipboard"
                  icon={Icon.Download}
                  onAction={() => void handleImportCustomTemplates("merge")}
                />
                <Action
                  title="Replace Custom Templates from Clipboard"
                  icon={Icon.Upload}
                  style={Action.Style.Destructive}
                  onAction={() => void handleImportCustomTemplates("replace")}
                />
              </ActionPanel>
            }
          />
        )}
      </List.Section>

      <List.Section title="Structure Builder">
        {visibleEntries.map((entry) => {
          const isRoot = entry.path.length === 0;
          const moveAvailability = getMoveAvailability(
            draftLayout.structure,
            entry.path,
          );
          const title = isSplitNode(entry.node)
            ? `Split (${entry.node.direction})`
            : entry.node.command;
          const subtitle = isSplitNode(entry.node)
            ? `${entry.node.panes.length} child ${entry.node.panes.length === 1 ? "node" : "nodes"}`
            : entry.node.workingDirectory || "No working directory";

          return (
            <List.Item
              key={formatNodePath(entry.path)}
              title={title}
              subtitle={subtitle}
              icon={
                isSplitNode(entry.node) ? Icon.AppWindowGrid3x3 : Icon.Terminal
              }
              accessories={[
                { text: `path ${formatNodePath(entry.path)}` },
                { text: `depth ${entry.depth}` },
                { text: formatNodeBreadcrumb(entry.path) },
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title="Edit Node"
                    icon={Icon.Pencil}
                    onAction={() => pushNodeEditor(entry)}
                  />
                  {canUndo && (
                    <Action
                      title="Undo"
                      icon={Icon.ArrowLeft}
                      shortcut={{ modifiers: ["cmd"], key: "z" }}
                      onAction={handleUndo}
                    />
                  )}
                  {canRedo && (
                    <Action
                      title="Redo"
                      icon={Icon.ArrowRight}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "z" }}
                      onAction={handleRedo}
                    />
                  )}
                  {isSplitNode(entry.node) && (
                    <Action
                      title="Add Pane Child"
                      icon={Icon.Plus}
                      onAction={() => void handleAddPane(entry.path)}
                    />
                  )}
                  {isSplitNode(entry.node) && (
                    <Action
                      title="Add Split Child"
                      icon={Icon.AppWindowGrid3x3}
                      onAction={() => void handleAddSplit(entry.path)}
                    />
                  )}
                  {isSplitNode(entry.node) && (
                    <ActionPanel.Submenu
                      title="Add Child from Template"
                      icon={Icon.PlusCircle}
                    >
                      {PANE_TEMPLATES.map((template) => (
                        <Action
                          key={`${formatNodePath(entry.path)}-${template.id}`}
                          title={`Add ${template.title} Pane`}
                          icon={template.icon}
                          onAction={() =>
                            void handleAddTemplate(entry.path, template)
                          }
                        />
                      ))}
                      {SPLIT_TEMPLATES.map((template) => (
                        <Action
                          key={`${formatNodePath(entry.path)}-${template.id}`}
                          title={`Add ${template.title}`}
                          icon={template.icon}
                          onAction={() =>
                            void handleAddTemplate(entry.path, template)
                          }
                        />
                      ))}
                      {customTemplateEntries.map((template) => (
                        <Action
                          key={`${formatNodePath(entry.path)}-${template.id}`}
                          title={`Add ${template.title}`}
                          icon={template.icon}
                          onAction={() =>
                            void handleAddTemplate(entry.path, template)
                          }
                        />
                      ))}
                    </ActionPanel.Submenu>
                  )}
                  <Action.Push
                    title="Save Node as Custom Template"
                    icon={Icon.PlusCircle}
                    target={
                      <SaveTemplateForm
                        defaultTitle={`${isSplitNode(entry.node) ? "Split" : "Pane"} ${formatNodePath(entry.path)}`}
                        onSubmit={(title) => {
                          void handleSaveCustomTemplate(entry.node, title);
                        }}
                      />
                    }
                  />
                  {!isRoot && moveAvailability.canMoveUp && (
                    <Action
                      title="Move Node Up"
                      icon={Icon.ArrowUp}
                      onAction={() => void handleMoveNode(entry.path, "up")}
                    />
                  )}
                  {!isRoot && moveAvailability.canMoveDown && (
                    <Action
                      title="Move Node Down"
                      icon={Icon.ArrowDown}
                      onAction={() => void handleMoveNode(entry.path, "down")}
                    />
                  )}
                  {!isRoot && (
                    <Action
                      title="Remove Node"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      onAction={() => void handleRemoveNode(entry.path)}
                    />
                  )}
                  <Action.Push
                    title="Edit Structure as JSON"
                    icon={Icon.Code}
                    target={
                      <JsonStructureEditor
                        initialStructure={draftLayout.structure}
                        onSubmit={(nextStructure) => {
                          applyDraftChange((previous) => ({
                            ...previous,
                            structure: nextStructure,
                          }));
                        }}
                      />
                    }
                  />
                  <Action
                    title="Save Layout"
                    icon={Icon.CheckCircle}
                    onAction={handleSaveLayout}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
