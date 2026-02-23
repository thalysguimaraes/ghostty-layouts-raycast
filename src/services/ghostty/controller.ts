export type SplitDirection = "vertical" | "horizontal";
export type PaneDirection = "left" | "right" | "up" | "down";

export interface GhosttyController {
  activate(): Promise<void>;
  newTab(): Promise<void>;
  newWindow(): Promise<void>;
  split(direction: SplitDirection): Promise<void>;
  navigate(direction: PaneDirection): Promise<void>;
  sendText(text: string): Promise<void>;
  pressEnter(): Promise<void>;
  getFrontmostAppName(): Promise<string>;
  getWindowTitle(): Promise<string>;
  getWindowDescription(): Promise<string>;
  getWindowName(): Promise<string>;
}
