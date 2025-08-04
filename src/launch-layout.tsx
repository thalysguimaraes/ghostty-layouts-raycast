import { useNavigation } from "@raycast/api";
import React, { useEffect, useState } from "react";
import { Layout } from "./types";
import { GhosttyTabInfo, detectCurrentGhosttyTab } from "./utils";
import RepoPicker from "./repo-picker";
import TabChoice from "./tab-choice";

interface Props {
  layout: Layout;
}

export default function LaunchLayout({ layout }: Props) {
  const { push } = useNavigation();
  const [tabInfo, setTabInfo] = useState<GhosttyTabInfo | null>(null);

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
