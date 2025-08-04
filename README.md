# Ghostty Layouts - Raycast Extension

A Raycast extension for managing and launching Ghostty terminal layouts with powerful templates and AI-powered creation.

## Features

### 🚀 Ready-to-Use Templates

**Developer Workspace** - `nvim + lf + lazygit + zsh`
- Neovim editor (main pane)
- LF file manager
- LazyGit for version control
- Terminal for commands

**System Monitor** - `top + htop + df + logs`
- CPU/memory monitoring with top
- Disk usage and virtual memory stats
- htop for process management
- Live error log streaming

**DevOps Control Center** - `k9s + lazydocker + kubectl + zsh`
- k9s Kubernetes dashboard
- LazyDocker container management
- Live deployment logs
- Terminal for kubectl commands

### 🤖 AI Layout Builder

Describe your desired layout in natural language and let AI create the perfect terminal setup for you.

Example prompts:
- "Create a React development setup with editor, dev server, and git"
- "I need a monitoring dashboard with system stats and logs"
- "Set up a data science workspace with Python and Jupyter"

## Installation

1. Clone this repository
2. Run `npm install`
3. Run `npm run build`
4. Import the extension into Raycast

## Usage

1. Open Raycast and search for "Ghostty Layouts"
2. Choose from ready-made templates or create custom layouts with AI
3. Launch directly or add to your personal collection
4. Manage your saved layouts from the main interface

## Template Requirements

Some templates require specific tools to be installed:

- **lf**: Terminal file manager (`brew install lf`)
- **lazygit**: Git TUI (`brew install lazygit`)  
- **htop**: Process monitor (`brew install htop`)
- **k9s**: Kubernetes TUI (`brew install k9s`)
- **lazydocker**: Docker TUI (`brew install lazydocker`)

## Customization

All templates can be customized after adding them to your layouts. The AI builder is perfect for creating unique setups tailored to your workflow.

## License

MIT
