import { LocalStorage } from "@raycast/api";
import { validatePaneNode, validateSplitNode } from "../domain/schema";
import { Pane, Split } from "../types";

const CUSTOM_NODE_TEMPLATES_KEY = "ghostty-custom-node-templates";

export interface CustomNodeTemplate {
  id: string;
  title: string;
  node: Pane | Split;
}

export type TemplateImportMode = "merge" | "replace";

interface RawTemplatePayload {
  id?: string;
  title: string;
  node: Pane | Split;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateTemplateNode(node: unknown): asserts node is Pane | Split {
  if (isRecord(node) && "command" in node) {
    validatePaneNode(node);
    return;
  }

  validateSplitNode(node);
}

function validateTemplate(value: unknown): asserts value is CustomNodeTemplate {
  if (!isRecord(value)) {
    throw new Error("Template must be an object");
  }

  if (typeof value.id !== "string" || !value.id.trim()) {
    throw new Error("Template id is required");
  }

  if (typeof value.title !== "string" || !value.title.trim()) {
    throw new Error("Template title is required");
  }

  validateTemplateNode(value.node);
}

function normalizeTemplate(value: CustomNodeTemplate): CustomNodeTemplate {
  return {
    id: value.id,
    title: value.title.trim(),
    node: JSON.parse(JSON.stringify(value.node)) as Pane | Split,
  };
}

function generateTemplateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sortTemplates(templates: CustomNodeTemplate[]): CustomNodeTemplate[] {
  return [...templates].sort((a, b) => a.title.localeCompare(b.title));
}

function ensureUniqueId(
  preferredId: string | undefined,
  usedIds: Set<string>,
): string {
  const candidate = preferredId?.trim();

  if (candidate && !usedIds.has(candidate)) {
    usedIds.add(candidate);
    return candidate;
  }

  let generated = generateTemplateId();
  while (usedIds.has(generated)) {
    generated = generateTemplateId();
  }

  usedIds.add(generated);
  return generated;
}

function parseRawTemplatePayload(value: unknown): RawTemplatePayload {
  if (!isRecord(value)) {
    throw new Error("Template payload must be an object");
  }

  if (typeof value.title !== "string" || !value.title.trim()) {
    throw new Error("Template payload must include title");
  }

  validateTemplateNode(value.node);

  return {
    id:
      typeof value.id === "string" && value.id.trim()
        ? value.id.trim()
        : undefined,
    title: value.title.trim(),
    node: JSON.parse(JSON.stringify(value.node)) as Pane | Split,
  };
}

async function setTemplates(templates: CustomNodeTemplate[]): Promise<void> {
  await LocalStorage.setItem(
    CUSTOM_NODE_TEMPLATES_KEY,
    JSON.stringify(
      sortTemplates(templates).map((template) => normalizeTemplate(template)),
    ),
  );
}

export async function getCustomNodeTemplates(): Promise<CustomNodeTemplate[]> {
  const raw = await LocalStorage.getItem<string>(CUSTOM_NODE_TEMPLATES_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return sortTemplates(
      parsed.map((item) => {
        validateTemplate(item);
        return normalizeTemplate(item);
      }),
    );
  } catch {
    return [];
  }
}

export async function addCustomNodeTemplate(
  title: string,
  node: Pane | Split,
): Promise<CustomNodeTemplate> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error("Template title is required");
  }

  validateTemplateNode(node);

  const templates = await getCustomNodeTemplates();
  const nextTemplate: CustomNodeTemplate = {
    id: generateTemplateId(),
    title: trimmedTitle,
    node: JSON.parse(JSON.stringify(node)) as Pane | Split,
  };

  await setTemplates([nextTemplate, ...templates]);
  return nextTemplate;
}

export async function removeCustomNodeTemplate(id: string): Promise<void> {
  const templates = await getCustomNodeTemplates();
  await setTemplates(templates.filter((template) => template.id !== id));
}

export async function exportCustomNodeTemplates(): Promise<string> {
  const templates = await getCustomNodeTemplates();
  return JSON.stringify(templates, null, 2);
}

export async function importCustomNodeTemplates(
  payload: string,
  options?: { mode?: TemplateImportMode },
): Promise<{ imported: number; total: number }> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("Invalid JSON payload");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Template payload must be an array");
  }

  const incoming = parsed.map((item) => parseRawTemplatePayload(item));
  const mode = options?.mode ?? "merge";

  const existingTemplates =
    mode === "replace" ? [] : await getCustomNodeTemplates();
  const usedIds = new Set(existingTemplates.map((template) => template.id));

  const importedTemplates = incoming.map((template) => ({
    id: ensureUniqueId(template.id, usedIds),
    title: template.title,
    node: template.node,
  }));

  const mergedTemplates = [...existingTemplates, ...importedTemplates];
  await setTemplates(mergedTemplates);

  return {
    imported: importedTemplates.length,
    total: mergedTemplates.length,
  };
}
