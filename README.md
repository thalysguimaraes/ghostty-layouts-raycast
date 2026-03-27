# Ghostty Layouts for Raycast

A Raycast extension for managing terminal layouts in [Ghostty](https://ghostty.org/). Create, save, and launch complex multi-pane terminal setups with a single command.

## Features

- **Launch layouts** — instantly create terminal layouts with multiple panes and commands
- **Repository picker** — browse dev directories with Git repo detection
- **AI Layout Builder** — generate layouts from natural language descriptions via OpenAI
- **Split panes** — horizontal and vertical splits with per-pane commands and working directories
- **Nested layouts** — support for deeply nested split arrangements

## Install

1. Install [Ghostty](https://ghostty.org/)
2. Install from the Raycast Store or build from source:

```bash
git clone https://github.com/thalysguimaraes/ghostty-layouts-raycast
cd ghostty-layouts-raycast
npm install && npm run build
```

3. Configure your **Developer Folder** path in Raycast Settings (e.g., `~/Developer`)
4. Optionally set an **OpenAI API Key** for the AI Layout Builder

## Usage

### Create a layout

**Manually**: Raycast > "Manage Layouts" > "Add New Layout" > define splits and commands

**With AI**: Raycast > "AI Layout Builder" > describe in natural language, e.g.:
- "nvim on the left, two terminals on the right for tests and git"
- "React dev setup with editor, dev server, test runner, and git status"

### Launch a layout

Search for any saved layout in Raycast, pick a repo, and the layout opens with all panes configured.

### Example layout

```json
{
  "name": "Full-Stack Dev",
  "structure": {
    "direction": "horizontal",
    "panes": [
      {
        "direction": "vertical",
        "panes": [
          { "command": "nvim" },
          { "command": "npm run dev" }
        ]
      },
      {
        "direction": "vertical",
        "panes": [
          { "command": "git status" },
          { "command": "npm run test:watch" }
        ]
      }
    ]
  }
}
```

## License

MIT
