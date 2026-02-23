/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Developer Folder - Path to your main developer folder containing all your repos */
  "developerFolder": string,
  /** OpenAI API Key - Your OpenAI API key for AI Layout Builder. Get one at https://platform.openai.com/api-keys */
  "openaiApiKey"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `launch-layouts` command */
  export type LaunchLayouts = ExtensionPreferences & {}
  /** Preferences accessible in the `manage-layouts` command */
  export type ManageLayouts = ExtensionPreferences & {}
  /** Preferences accessible in the `ai-builder` command */
  export type AiBuilder = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `launch-layouts` command */
  export type LaunchLayouts = {}
  /** Arguments passed to the `manage-layouts` command */
  export type ManageLayouts = {}
  /** Arguments passed to the `ai-builder` command */
  export type AiBuilder = {}
}

