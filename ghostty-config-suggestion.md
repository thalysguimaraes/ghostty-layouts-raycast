# Ghostty Configuration for Better Directory Detection

To improve the Ghostty Layouts extension's ability to detect your current directory, add these settings to your Ghostty config:

## Option 1: Window Subtitle (Recommended)
```
window-subtitle = working-directory
```
This shows the current working directory in the window subtitle.

## Option 2: Shell Integration with Dynamic Titles
```
shell-integration-features = title
```
This allows your shell to dynamically update the window title with current directory info.

## Option 3: Titlebar Proxy Icon (macOS only)
```
macos-titlebar-style = native
macos-titlebar-proxy-icon = true
```
Shows a proxy icon in the titlebar representing the current directory.

## How to Apply
1. Open your Ghostty config file (usually `~/.config/ghostty/config`)
2. Add one of the configurations above
3. Restart Ghostty or reload the config

The extension will then be able to better detect your current working directory for more intelligent layout launching.
