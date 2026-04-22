import sys

def extract_drawer():
    with open('src/App.tsx', 'r', encoding='utf-8') as f:
        lines = f.readlines()

    start_idx = -1
    end_idx = -1
    for i, line in enumerate(lines):
        if '<motion.aside' in line:
            if start_idx == -1:
                start_idx = i
        elif '</motion.aside>' in line:
            end_idx = i

    if start_idx == -1 or end_idx == -1:
        print(f"Error: Could not find motion.aside boundaries. Start: {start_idx}, End: {end_idx}")
        sys.exit(1)
        
    print(f"Extracting carefully from {start_idx} to {end_idx}...")

    # We want to extract one line above Start to properly capture the drawer initial state
    drawer_lines = lines[start_idx:end_idx + 1]

    component_str = """import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Copy, ExternalLink, Play, Pause, Trash2, FolderOpen, Globe, Github, Server, RefreshCw } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea, ScrollBar } from "./ui/scroll-area";
import { cn } from "@/lib/utils";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { useAppStore, useChatStore, useAgentStore } from "../../store";

export function ActivityDrawer({ legacyProps }: { legacyProps: any }) {
  const {
    currentLiveActivities,
    formatRelativeTime,
    files,
    terminalLines,
    commandRunRecords,
    executeCommandRef,
    isExecutingCommand,
    workspaceAgentBrowserSessions,
    handleNewBrowserUseSession,
    handleStopBrowserUseSession,
    isCreatingBrowserSession,
    selectedAgent,
    activeTriggers,
    hasAgentRuntime,
    cancelCommandRun
  } = legacyProps;

  const isActivityDrawerOpen = useAppStore(s => s.isActivityDrawerOpen);
  const setIsActivityDrawerOpen = useAppStore(s => s.setIsActivityDrawerOpen);
  const activityDrawerTab = useAppStore(s => s.activityDrawerTab);
  const setActivityDrawerTab = useAppStore(s => s.setActivityDrawerTab);
  const workspaceView = useAppStore(s => s.workspaceView);

  return (
""" + "".join(drawer_lines) + """
  );
}
"""

    with open('src/components/activity/ActivityDrawer.tsx', 'w', encoding='utf-8') as f:
        f.write(component_str)

    # Now replace the lines in App.tsx
    lines_to_keep = lines[:start_idx] + [
        "        <ActivityDrawer legacyProps={{\n",
        "          currentLiveActivities, formatRelativeTime, files, terminalLines, commandRunRecords, executeCommandRef, isExecutingCommand, workspaceAgentBrowserSessions, handleNewBrowserUseSession, handleStopBrowserUseSession, isCreatingBrowserSession, selectedAgent, activeTriggers, hasAgentRuntime, cancelCommandRun\n",
        "        }} />\n"
    ] + lines[end_idx + 1:]

    with open('src/App.tsx', 'w', encoding='utf-8') as f:
        f.writelines(lines_to_keep)

    print("Extraction successful!")

if __name__ == "__main__":
    extract_drawer()
