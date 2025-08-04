import React from "react";
import AIBuilderForm from "./ai-builder-form";
import { showToast, Toast } from "@raycast/api";

export default function AIBuilderCommand() {
  function handleSave() {
    showToast({
      style: Toast.Style.Success,
      title: "Layout saved successfully",
      message: "You can now launch it from Manage Layouts",
    });
  }

  return <AIBuilderForm onSave={handleSave} />;
}