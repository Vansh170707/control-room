import sys

def extract_chat_area():
    with open('src/App.tsx', 'r', encoding='utf-8') as f:
        lines = f.readlines()

    start_idx = -1
    end_idx = -1
    for i, line in enumerate(lines):
        if '<main' in line and 'flex-1' in line:
            if start_idx == -1:
                start_idx = i
        elif '</main>' in line:
            if start_idx != -1 and end_idx == -1:
                end_idx = i

    if start_idx == -1 or end_idx == -1:
        print(f"Error: Could not find main boundaries. Start: {start_idx}, End: {end_idx}")
        sys.exit(1)
        
    print(f"Extracting carefully from {start_idx} to {end_idx}...")

    chat_lines = lines[start_idx:end_idx + 1]

    component_str = """import React, { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Terminal, StopCircle, RefreshCw, Send, Check, Paperclip, X, Brain, AlertCircle, Maximize2, Minimize2, Image as ImageIcon } from "lucide-react";
import { Button } from "../ui/button";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { cn } from "@/lib/utils";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { useAppStore, useChatStore, useAgentStore } from "../../store";

export function ChatArea({ legacyProps }: { legacyProps: any }) {
  const {
      selectedAgent,
      messages,
      isExecutingCommand,
      hasAgentRuntime,
      setIsCommandApprovalModalOpen,
      handleCommandApproval,
      cancelCommandRun,
      isCommandApprovalModalOpen,
      commandUnderReview,
      formatRelativeTime,
      input,
      setInput,
      isGenerating,
      sendMessage,
      retryMessage,
      cancelGeneration,
      files,
      setFiles,
      fileInputRef,
      handleFileUpload,
      handleRemoveFile,
      isDragging,
      setIsDragging,
      toggleTimelineExpanded,
      expandedTimelineIds,
      timelineEvents,
      activityBadgeClasses,
      currentThreadName,
      agentOptions
  } = legacyProps;

  // Zustand stores
  const channels = useChatStore(s => s.channels);
  const selectedChannelId = useAppStore(s => s.selectedChannelId);
  const isAgentDropdownOpen = useAppStore(s => s.isAgentDropdownOpen);
  const setIsAgentDropdownOpen = useAppStore(s => s.setIsAgentDropdownOpen);
  const composerExpanded = useAppStore(s => s.composerExpanded);
  const setComposerExpanded = useAppStore(s => s.setComposerExpanded);
  

  const activeChannel = React.useMemo(() => channels.find((c) => c.id === selectedChannelId), [channels, selectedChannelId]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when messages change or generation happens
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);


  return (
""" + "".join(chat_lines) + """
  );
}
"""

    with open('src/components/chat/ChatArea.tsx', 'w', encoding='utf-8') as f:
        f.write(component_str)

    # Now replace the lines in App.tsx
    lines_to_keep = lines[:start_idx] + [
        "        <ChatArea legacyProps={{\n",
        "          selectedAgent, messages, isExecutingCommand, hasAgentRuntime, setIsCommandApprovalModalOpen, handleCommandApproval,\n",
        "          cancelCommandRun, isCommandApprovalModalOpen, commandUnderReview, formatRelativeTime, input, setInput, isGenerating,\n",
        "          sendMessage, retryMessage, cancelGeneration, files, setFiles, fileInputRef, handleFileUpload, handleRemoveFile,\n",
        "          isDragging, setIsDragging, toggleTimelineExpanded, expandedTimelineIds, timelineEvents, activityBadgeClasses,\n",
        "          currentThreadName, agentOptions\n",
        "        }} />\n"
    ] + lines[end_idx + 1:]

    # Also import ChatArea in App.tsx at the top
    for i, line in enumerate(lines_to_keep):
        if "import { CommandApprovalModal }" in line:
            lines_to_keep.insert(i + 1, 'import { ChatArea } from "./components/chat/ChatArea";\n')
            break

    with open('src/App.tsx', 'w', encoding='utf-8') as f:
        f.writelines(lines_to_keep)

    print("Extraction successful!")

if __name__ == "__main__":
    extract_chat_area()
