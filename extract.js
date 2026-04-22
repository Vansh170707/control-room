const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf-8');
const lines = content.split('\n');

const drawerStart = 11134; // <AnimatePresence>
const drawerEnd = 11854; // </AnimatePresence>

const drawerLines = lines.slice(drawerStart, drawerEnd + 1);

let componentStr = `import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Copy, ExternalLink, Play, Pause, Trash2, FolderOpen, Globe, Github, Server, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function ActivityDrawer({
  legacyProps
}: { legacyProps: any }) {
  const {
    shouldShowRuntimeAside,
    setIsActivityDrawerOpen,
    activityDrawerTab,
    setActivityDrawerTab,
    currentLiveActivities,
    activityBadgeClasses,
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
    workspaceView,
    activeTriggers,
    hasAgentRuntime
  } = legacyProps;

  return (
    <>
${drawerLines.join('\n')}
    </>
  );
}
`;

fs.writeFileSync('src/components/activity/ActivityDrawer.tsx', componentStr);

lines.splice(drawerStart, drawerEnd - drawerStart + 1, '      <ActivityDrawer legacyProps={{ shouldShowRuntimeAside, setIsActivityDrawerOpen, activityDrawerTab, setActivityDrawerTab, currentLiveActivities, activityBadgeClasses, formatRelativeTime, files, terminalLines, commandRunRecords, executeCommandRef, isExecutingCommand, workspaceAgentBrowserSessions, handleNewBrowserUseSession, handleStopBrowserUseSession, isCreatingBrowserSession, selectedAgent, workspaceView, activeTriggers, hasAgentRuntime }} />');

fs.writeFileSync('src/App.tsx', lines.join('\n'));
