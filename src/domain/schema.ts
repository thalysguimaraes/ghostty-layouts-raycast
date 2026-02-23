import { Pane, Split } from "../types";

export interface AILayoutPayload {
  name?: string;
  description?: string;
  structure: Split;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isSplitNode(node: Pane | Split): node is Split {
  return "direction" in node && "panes" in node;
}

export function validatePaneNode(node: unknown): asserts node is Pane {
  if (
    !isRecord(node) ||
    typeof node.command !== "string" ||
    !node.command.trim()
  ) {
    throw new Error("Pane must include a non-empty command");
  }

  if (
    "workingDirectory" in node &&
    node.workingDirectory !== undefined &&
    typeof node.workingDirectory !== "string"
  ) {
    throw new Error("Pane workingDirectory must be a string");
  }

  if (
    "size" in node &&
    node.size !== undefined &&
    (typeof node.size !== "number" || node.size <= 0 || node.size > 100)
  ) {
    throw new Error("Pane size must be between 1 and 100");
  }
}

export function validateSplitNode(node: unknown): asserts node is Split {
  if (!isRecord(node)) {
    throw new Error("Split must be an object");
  }

  if (node.direction !== "vertical" && node.direction !== "horizontal") {
    throw new Error("Split direction must be vertical or horizontal");
  }

  if (!Array.isArray(node.panes) || node.panes.length === 0) {
    throw new Error("Split panes must be a non-empty array");
  }

  for (const pane of node.panes) {
    if (isRecord(pane) && "command" in pane) {
      validatePaneNode(pane);
    } else {
      validateSplitNode(pane);
    }
  }
}

export function validateLayoutStructure(
  value: unknown,
): asserts value is Split {
  validateSplitNode(value);
}

export function parseJsonValue(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    const lines = trimmed.split("\n");
    const withoutFence = lines.slice(1, -1).join("\n").trim();
    const payload = withoutFence.startsWith("json")
      ? withoutFence.slice(4).trim()
      : withoutFence;
    return JSON.parse(payload);
  }

  return JSON.parse(trimmed);
}

export function parseLayoutStructureJson(value: string): Split {
  const parsed = parseJsonValue(value);
  validateLayoutStructure(parsed);
  return parsed;
}

export function parseAILayoutPayload(value: unknown): AILayoutPayload {
  if (!isRecord(value)) {
    throw new Error("AI response must be an object");
  }

  if (!("structure" in value)) {
    throw new Error("AI response must include structure");
  }

  validateLayoutStructure(value.structure);

  return {
    name: typeof value.name === "string" ? value.name : undefined,
    description:
      typeof value.description === "string" ? value.description : undefined,
    structure: value.structure,
  };
}
