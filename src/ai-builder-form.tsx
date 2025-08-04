import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
  getPreferenceValues,
} from "@raycast/api";
import React, { useState } from "react";
import { Layout, Split } from "./types";
import { saveLayout } from "./layouts";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";

interface Preferences {
  openaiApiKey?: string;
}

interface Props {
  onSave: () => void;
}

export default function AIBuilderForm({ onSave }: Props) {
  const { pop } = useNavigation();
  const preferences = getPreferenceValues<Preferences>();
  const [description, setDescription] = useState("");
  const [layoutName, setLayoutName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLayout, setGeneratedLayout] = useState<Layout | null>(null);

  async function generateLayout() {
    if (!description.trim()) {
      showToast({
        style: Toast.Style.Failure,
        title: "Description is required",
      });
      return;
    }

    if (!preferences.openaiApiKey) {
      showToast({
        style: Toast.Style.Failure,
        title: "OpenAI API Key Required",
        message: "Please set your API key in extension preferences",
      });
      return;
    }

    setIsGenerating(true);
    
    try {
      const openai = new OpenAI({
        apiKey: preferences.openaiApiKey,
      });
      showToast({
        style: Toast.Style.Animated,
        title: "AI is generating your layout...",
      });

      const prompt = `
You are an expert terminal layout designer. Convert the following natural language description into a Ghostty terminal layout structure.

Description: "${description}"

You must respond with ONLY valid JSON that matches this TypeScript interface:

interface Pane {
  command: string;
  workingDirectory?: string;
  size?: number; // percentage for splits
}

interface Split {
  direction: "vertical" | "horizontal";
  panes: (Pane | Split)[];
}

interface Layout {
  name: string;
  description: string;
  structure: Split;
}

Rules:
- "vertical" splits create side-by-side panes
- "horizontal" splits create top/bottom panes
- Use common terminal commands (nvim, vim, zsh, bash, npm run dev, etc.)
- For development work, include editors, servers, git tools
- Make logical directory assignments
- Keep it practical and usable
- Include size percentages for main/secondary panes when appropriate

Example structure for "editor and terminal":
{
  "name": "Editor and Terminal",
  "description": "Code editor with terminal below",
  "structure": {
    "direction": "horizontal",
    "panes": [
      { "command": "nvim", "size": 70 },
      { "command": "zsh", "size": 30 }
    ]
  }
}

Respond with JSON only:`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a terminal layout expert. Respond with valid JSON only, no explanations or markdown formatting."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error("No response from AI");
      }

      console.log("AI Response:", response);

      // Parse the JSON response
      const aiLayout = JSON.parse(response.trim());
      
      const layout: Layout = {
        id: uuidv4(),
        name: layoutName.trim() || aiLayout.name || "AI Generated Layout",
        description: aiLayout.description || description,
        structure: aiLayout.structure,
      };

      setGeneratedLayout(layout);
      
      showToast({
        style: Toast.Style.Success,
        title: "Layout generated successfully!",
        message: "Review and save your layout",
      });

    } catch (error) {
      console.error("AI generation error:", error);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to generate layout",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveGeneratedLayout() {
    if (!generatedLayout) return;

    try {
      await saveLayout(generatedLayout);
      
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

  function renderLayoutPreview(structure: Split | any, depth = 0): string {
    if (structure.command) {
      // It's a pane
      const indent = "  ".repeat(depth);
      const workingDir = structure.workingDirectory ? ` (${structure.workingDirectory})` : "";
      const size = structure.size ? ` [${structure.size}%]` : "";
      return `${indent}📟 \`${structure.command}\`${workingDir}${size}`;
    } else {
      // It's a split
      const { direction, panes } = structure;
      const indent = "  ".repeat(depth);
      const directionIcon = direction === "vertical" ? "↔️" : "↕️";
      const directionText = direction === "vertical" ? "Vertical Split" : "Horizontal Split";
      
      let result = `${indent}${directionIcon} **${directionText}**\n`;
      
      panes.forEach((pane: any, index: number) => {
        result += renderLayoutPreview(pane, depth + 1);
        if (index < panes.length - 1) {
          result += "\n";
        }
      });
      
      return result;
    }
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
                  generateLayout();
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
        placeholder="I want a layout with Neovim taking 70% of the screen on the left, and on the right side I want two horizontal panes - one running npm run dev and another with lazygit"
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
      
      {!preferences.openaiApiKey && (
        <Form.Description
          title="⚠️ API Key Required"
          text="To use AI Layout Builder, please set your OpenAI API key in Raycast Settings → Extensions → Ghostty Layouts → Preferences"
        />
      )}
    </Form>
  );
}
