import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Zap,
  MessageSquare,
  Terminal,
  Globe,
  Server,
  Eye,
  EyeOff,
  Trash2,
  RotateCcw,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "../../store/useAppStore";

interface CommandItem {
  id: string;
  type: "agent" | "channel" | "action";
  label: string;
  subtitle?: string;
  emoji?: string;
  icon?: React.ReactNode;
  keywords?: string[];
  onSelect: () => void;
}

interface CommandPaletteProps {
  agents: Array<{ id: string; name: string; emoji?: string; role?: string }>;
  channels: Array<{ id: string; title: string; emoji?: string }>;
  onSelectAgent: (agentId: string) => void;
  onSelectChannel: (channelId: string) => void;
  onClearConsole?: () => void;
  onRestartRuntime?: () => void;
}

const CATEGORY_ORDER = ["action", "agent", "channel"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  action: "Quick Actions",
  agent: "Agents",
  channel: "Channels",
};

export function CommandPalette({
  agents,
  channels,
  onSelectAgent,
  onSelectChannel,
  onClearConsole,
  onRestartRuntime,
}: CommandPaletteProps) {
  const isOpen = useAppStore((s) => s.isCommandPaletteOpen);
  const setIsOpen = useAppStore((s) => s.setIsCommandPaletteOpen);
  const setIsActivityDrawerOpen = useAppStore((s) => s.setIsActivityDrawerOpen);
  const setActivityDrawerTab = useAppStore((s) => s.setActivityDrawerTab);

  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build command list
  const allCommands: CommandItem[] = [
    {
      id: "action-activity",
      type: "action",
      label: "Open Activity Drawer",
      subtitle: "View live agent activity",
      icon: <Eye className="h-3.5 w-3.5" />,
      keywords: ["open", "activity", "log", "drawer"],
      onSelect: () => {
        setIsActivityDrawerOpen(true);
        setActivityDrawerTab("activity");
        setIsOpen(false);
      },
    },
    {
      id: "action-terminal",
      type: "action",
      label: "Open Terminal Tab",
      subtitle: "Switch to agent terminal view",
      icon: <Terminal className="h-3.5 w-3.5" />,
      keywords: ["terminal", "shell", "bash", "command"],
      onSelect: () => {
        setIsActivityDrawerOpen(true);
        setActivityDrawerTab("terminal");
        setIsOpen(false);
      },
    },
    {
      id: "action-browser",
      type: "action",
      label: "Open Browser Tab",
      subtitle: "View live browser sessions",
      icon: <Globe className="h-3.5 w-3.5" />,
      keywords: ["browser", "session", "live"],
      onSelect: () => {
        setIsActivityDrawerOpen(true);
        setActivityDrawerTab("browser");
        setIsOpen(false);
      },
    },
    ...(onRestartRuntime
      ? [
          {
            id: "action-restart",
            type: "action" as const,
            label: "Restart Runtime",
            subtitle: "Reconnect native local server",
            icon: <RotateCcw className="h-3.5 w-3.5" />,
            keywords: ["restart", "server", "runtime", "reconnect"],
            onSelect: () => {
              onRestartRuntime();
              setIsOpen(false);
            },
          },
        ]
      : []),
    ...(onClearConsole
      ? [
          {
            id: "action-clear",
            type: "action" as const,
            label: "Clear Console",
            subtitle: "Wipe the terminal output history",
            icon: <Trash2 className="h-3.5 w-3.5" />,
            keywords: ["clear", "console", "wipe", "reset"],
            onSelect: () => {
              onClearConsole();
              setIsOpen(false);
            },
          },
        ]
      : []),
    ...agents.map((agent) => ({
      id: `agent-${agent.id}`,
      type: "agent" as const,
      label: agent.name,
      subtitle: agent.role ?? "Agent",
      emoji: agent.emoji,
      keywords: [agent.name.toLowerCase(), "agent"],
      onSelect: () => {
        onSelectAgent(agent.id);
        setIsOpen(false);
      },
    })),
    ...channels.map((ch) => ({
      id: `channel-${ch.id}`,
      type: "channel" as const,
      label: ch.title,
      subtitle: "Channel",
      emoji: ch.emoji ?? "#",
      keywords: [ch.title.toLowerCase(), "channel", "thread"],
      onSelect: () => {
        onSelectChannel(ch.id);
        setIsOpen(false);
      },
    })),
  ];

  const filtered = query.trim()
    ? allCommands.filter((cmd) => {
        const q = query.toLowerCase();
        return (
          cmd.label.toLowerCase().includes(q) ||
          cmd.subtitle?.toLowerCase().includes(q) ||
          cmd.keywords?.some((k) => k.includes(q))
        );
      })
    : allCommands;

  // Group by type
  const grouped = CATEGORY_ORDER.reduce<Record<string, CommandItem[]>>(
    (acc, type) => {
      const items = filtered.filter((c) => c.type === type);
      if (items.length > 0) acc[type] = items;
      return acc;
    },
    {}
  );

  // Flat ordered list for keyboard nav
  const flatList = CATEGORY_ORDER.flatMap((t) => grouped[t] ?? []);

  const handleSelect = useCallback(
    (cmd: CommandItem) => {
      cmd.onSelect();
      setQuery("");
      setSelectedIdx(0);
    },
    []
  );

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, flatList.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatList[selectedIdx]) handleSelect(flatList[selectedIdx]);
      } else if (e.key === "Escape") {
        setIsOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, flatList, selectedIdx, handleSelect, setIsOpen]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Reset selection on query change
  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  let flatIdx = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="palette-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setIsOpen(false);
              setQuery("");
            }}
          />

          {/* Palette */}
          <motion.div
            key="palette-panel"
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 top-[18%] z-50 w-full max-w-[540px] -translate-x-1/2"
          >
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(18,26,37,0.97),rgba(11,17,25,0.99))] shadow-2xl shadow-black/60 ring-1 ring-inset ring-white/[0.04]">
              {/* Search bar */}
              <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3.5">
                <Search className="h-4 w-4 shrink-0 text-[#6e7f92]" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search agents, channels, actions…"
                  className="flex-1 bg-transparent text-[14px] text-[#e8f0f8] placeholder-[#4f6070] outline-none"
                />
                <kbd className="hidden rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-[#5a6e7f] sm:block">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-[380px] overflow-y-auto py-2">
                {flatList.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[13px] text-[#4f6070]">
                    No results for "{query}"
                  </div>
                ) : (
                  CATEGORY_ORDER.map((type) => {
                    const items = grouped[type];
                    if (!items?.length) return null;
                    return (
                      <div key={type}>
                        <div className="px-4 pb-1 pt-2.5">
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#3f5266]">
                            {CATEGORY_LABELS[type]}
                          </span>
                        </div>
                        {items.map((cmd) => {
                          const isSelected = flatIdx === selectedIdx;
                          const currentIdx = flatIdx++;
                          return (
                            <button
                              key={cmd.id}
                              type="button"
                              onMouseEnter={() => setSelectedIdx(currentIdx)}
                              onClick={() => handleSelect(cmd)}
                              className={cn(
                                "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                                isSelected
                                  ? "bg-white/[0.06]"
                                  : "hover:bg-white/[0.03]"
                              )}
                            >
                              {/* Icon / Emoji */}
                              <div
                                className={cn(
                                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[13px]",
                                  cmd.type === "action"
                                    ? "border-[#2a4566]/60 bg-[#10263f]/50 text-[#4a9eff]"
                                    : cmd.type === "agent"
                                    ? "border-[#2a3a26]/60 bg-[#122010]/50 text-[#4ade80]"
                                    : "border-[#3a2a50]/60 bg-[#1e1030]/50 text-[#a78bfa]"
                                )}
                              >
                                {cmd.emoji ? (
                                  <span>{cmd.emoji}</span>
                                ) : (
                                  cmd.icon ?? (
                                    <Zap className="h-3.5 w-3.5" />
                                  )
                                )}
                              </div>

                              {/* Label */}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-medium text-[#dde8f0]">
                                  {cmd.label}
                                </p>
                                {cmd.subtitle && (
                                  <p className="truncate text-[11px] text-[#4f6070]">
                                    {cmd.subtitle}
                                  </p>
                                )}
                              </div>

                              {/* Arrow */}
                              {isSelected && (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#4f6070]" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer hint */}
              <div className="flex items-center gap-4 border-t border-white/6 px-4 py-2.5 text-[10px] text-[#3a5060]">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-white/8 bg-white/[0.03] px-1 py-0.5">↑↓</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-white/8 bg-white/[0.03] px-1 py-0.5">↵</kbd>
                  select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-white/8 bg-white/[0.03] px-1 py-0.5">Esc</kbd>
                  close
                </span>
                <span className="ml-auto flex items-center gap-1">
                  <kbd className="rounded border border-white/8 bg-white/[0.03] px-1 py-0.5">⌘K</kbd>
                  toggle
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
