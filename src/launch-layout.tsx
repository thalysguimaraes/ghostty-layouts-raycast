import { useNavigation } from "@raycast/api";
import React, { useEffect } from "react";
import { Layout } from "./types";
import RepoPicker from "./repo-picker";

interface Props {
  layout: Layout;
}

export default function LaunchLayout({ layout }: Props) {
  const { push } = useNavigation();

  useEffect(() => {
    // Temporarily disabled current tab detection - go directly to repo picker
    // async function checkCurrentTab() {
    //   const info = await detectCurrentGhosttyTab();
    //   setTabInfo(info);

    //   if (info.isSingleTab) {
    //     // Show choice UI when single tab is detected (even without directory)
    //     push(<TabChoice layout={layout} tabInfo={info} />);
    //   } else {
    //     // Default to repo picker
    //     push(<RepoPicker layout={layout} target="new-tab" />);
    //   }
    // }

    // checkCurrentTab();

    // Go directly to repo picker for manual selection
    push(<RepoPicker layout={layout} target="new-tab" />);
  }, [layout, push]);

  // This component just handles the navigation logic
  return null;
}
