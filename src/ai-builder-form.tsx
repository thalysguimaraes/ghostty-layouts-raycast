import {
  AI,
  Action,
  ActionPanel,
  Form,
  Icon,
  getPreferenceValues,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import React, { useState } from "react";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import { saveLayout } from "./layouts";
import { Layout, Pane, Split } from "./types";
import {
  AILayoutPayload,
  parseAILayoutPayload,
  parseJsonValue,
} from "./domain/schema";

interface Preferences {
  openaiApiKey?: string;
}

interface Props {
  onSave: () => void;
}

function buildLayoutPrompt(description: string): string {
  return `You design productive Ghostty terminal layouts.

Return only valid JSON with this shape:
{
  "name": "string",
  "description": "string",
  "structure": {
    "direction": "vertical" | "horizontal",
    "panes": [Pane | Split]
  }
}

Pane shape:
{
  "command": "string",
  "workingDirectory": "string (optional)",
  "size": number (optional, 1-100)
}

Rules:
- vertical = side by side panes
- horizontal = top/bottom panes
- use practical commands for developer workflow
- keep pane hierarchy coherent and realistic
- include size only when useful

User description:
"${description}"`;
}

function buildRepairPrompt(rawResponse: string, error: string): string {
  return `Fix this JSON for the Ghostty layout schema.

Validation error:
${error}

Original response:
${rawResponse}

Return only valid JSON. Do not add markdown.`;
}

export default function AIBuilderForm({ onSave }: Props) {
  const { pop } = useNavigation();
  const preferences = getPreferenceValues<Preferences>();
  const [description, setDescription] = useState("");
  const [layoutName, setLayoutName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLayout, setGeneratedLayout] = useState<Layout | null>(null);

  async function requestWithRaycastAI(prompt: string): Promise<string> {
    return AI.ask(prompt, {
      creativity: "low",
      model: AI.Model["OpenAI_GPT4o-mini"],
    });
  }

  async function requestWithOpenAI(prompt: string): Promise<string> {
    if (!preferences.openaiApiKey) {
      throw new Error(
        "Raycast AI unavailable and no OpenAI API key configured in preferences",
      );
    }

    const openai = new OpenAI({ apiKey: preferences.openaiApiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a Ghostty terminal layout expert. Respond only with strict JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 1000,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error("No response from OpenAI");
    }

    return response;
  }

  async function requestLayout(prompt: string): Promise<string> {
    try {
      return await requestWithRaycastAI(prompt);
    } catch (raycastError) {
      return requestWithOpenAI(prompt);
    }
  }

  async function generateLayout() {
    if (!description.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Description is required",
      });
      return;
    }

    setIsGenerating(true);

    try {
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: "AI is generating your layout...",
      });

      const prompt = buildLayoutPrompt(description.trim());
      const firstResponse = await requestLayout(prompt);

      let aiLayout: AILayoutPayload;
      try {
        aiLayout = parseAILayoutPayload(parseJsonValue(firstResponse));
      } catch (error) {
        toast.message = "Repairing AI output...";
        const repairResponse = await requestLayout(
          buildRepairPrompt(
            firstResponse,
            error instanceof Error ? error.message : String(error),
          ),
        );
        aiLayout = parseAILayoutPayload(parseJsonValue(repairResponse));
      }

      const layout: Layout = {
        id: uuidv4(),
        name: layoutName.trim() || aiLayout.name || "AI Generated Layout",
        description: aiLayout.description || description,
        structure: aiLayout.structure,
      };

      setGeneratedLayout(layout);

      toast.style = Toast.Style.Success;
      toast.title = "Layout generated successfully";
      toast.message = "Review and save your layout";
    } catch (error) {
      console.error("AI generation error:", error);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to generate layout",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveGeneratedLayout() {
    if (!generatedLayout) {
      return;
    }

    try {
      await saveLayout(generatedLayout);

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
        message: String(error),
      });
    }
  }

  function renderLayoutPreview(structure: Split | Pane, depth = 0): string {
    if ("command" in structure) {
      const indent = "  ".repeat(depth);
      const workingDir = structure.workingDirectory
        ? ` (${structure.workingDirectory})`
        : "";
      const size = structure.size ? ` [${structure.size}%]` : "";
      return `${indent}📟 \`${structure.command}\`${workingDir}${size}`;
    }

    const { direction, panes } = structure;
    const indent = "  ".repeat(depth);
    const directionIcon = direction === "vertical" ? "↔️" : "↕️";
    const directionText =
      direction === "vertical" ? "Vertical Split" : "Horizontal Split";

    let result = `${indent}${directionIcon} **${directionText}**\n`;

    panes.forEach((pane: Split | Pane, index: number) => {
      result += renderLayoutPreview(pane, depth + 1);
      if (index < panes.length - 1) {
        result += "\n";
      }
    });

    return result;
  }

  return (
    <Form
      isLoading={isGenerating}
      actions={
        <ActionPanel>
          {!generatedLayout ? (
            <Action.SubmitForm
              title="Generate Layout"
              icon={Icon.Wand}
              onSubmit={generateLayout}
            />
          ) : (
            <>
              <Action
                title="Save Layout"
                icon={Icon.CheckCircle}
                onAction={saveGeneratedLayout}
              />
              <Action
                title="Regenerate"
                icon={Icon.ArrowClockwise}
                onAction={() => {
                  setGeneratedLayout(null);
                  void generateLayout();
                }}
              />
            </>
          )}
        </ActionPanel>
      }
    >
      <Form.TextField
        id="layoutName"
        title="Layout Name"
        placeholder="My Development Setup"
        value={layoutName}
        onChange={setLayoutName}
      />

      <Form.TextArea
        id="description"
        title="Describe Your Layout"
        placeholder="I want Neovim on the left and two panes on the right running npm run dev and lazygit"
        value={description}
        onChange={setDescription}
      />

      {generatedLayout && (
        <>
          <Form.Separator />
          <Form.Description
            title="Generated Layout Preview"
            text={`**${generatedLayout.name}**\n\n${generatedLayout.description}\n\n${renderLayoutPreview(generatedLayout.structure)}`}
          />
        </>
      )}

      <Form.Description
        title="Examples"
        text={`• "Neovim on the left, terminal on the right"
• "Editor at the top taking 60%, below that split horizontally with server and git"
• "Three column layout: editor, terminal, and logs"
• "Full stack setup with frontend dev server, backend API, and database console"`}
      />

      <Form.Description
        title="AI Provider"
        text="Uses Raycast AI by default. OpenAI API key in preferences is an optional fallback."
      />
    </Form>
  );
}
