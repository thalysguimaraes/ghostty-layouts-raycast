export interface Pane {
  command: string;
  workingDirectory?: string;
  size?: number; // percentage for splits
}

export interface Split {
  direction: "vertical" | "horizontal";
  panes: (Pane | Split)[];
}

export interface Layout {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  rootDirectory?: string;
  structure: Split;
}

export interface LayoutPreset {
  name: string;
  description: string;
  structure: Split;
}
