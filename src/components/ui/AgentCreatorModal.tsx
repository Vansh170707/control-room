import React, { useState } from "react";
import { Sparkles, Plus, X, Terminal, Globe, FileCode, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePhase4Store } from "@/store/usePhase4Store";
import { Button } from "@/components/ui/button";
import type { AgentBlueprint } from "@/lib/phase4";

interface AgentCreatorModalProps {
  onConfirm: (blueprint: AgentBlueprint) => void;
}

const EMOJI_OPTIONS = ["🤖", "🎨", "🧪", "⚙️", "📊", "✍️", "🔐", "🚀", "🔬", "📡", "🧠", "🛠️"];

function PermissionToggle({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition-all",
        value
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          : "border-[#30363d] bg-[#0d1117] text-[#6e7681] hover:border-[#484f58]",
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

export function AgentCreatorModal({ onConfirm }: AgentCreatorModalProps) {
  const { pendingBlueprint, isAgentCreatorOpen, setIsAgentCreatorOpen, setPendingBlueprint } =
    usePhase4Store();

  const [draft, setDraft] = useState<AgentBlueprint | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const blueprint = draft ?? pendingBlueprint;

  React.useEffect(() => {
    if (pendingBlueprint && !draft) {
      setDraft({ ...pendingBlueprint });
    }
  }, [pendingBlueprint]);

  if (!isAgentCreatorOpen || !blueprint) return null;

  function handleClose() {
    setIsAgentCreatorOpen(false);
    setDraft(null);
    setPendingBlueprint(null);
  }

  function handleConfirm() {
    if (!blueprint) return;
    onConfirm(blueprint);
    handleClose();
  }

  function update(patch: Partial<AgentBlueprint>) {
    setDraft((prev) => ({ ...(prev ?? blueprint!), ...patch }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className={cn(
          "relative w-full max-w-lg rounded-2xl border border-[#30363d] bg-[#0d1117] shadow-2xl",
          "animate-in zoom-in-95 duration-200",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#21262d] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15">
              <Sparkles className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#e6edf3]">Agent Creator</p>
              <p className="text-[10px] text-[#6e7681]">
                A new specialist was generated to fill a capability gap
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded p-1 text-[#6e7681] transition-colors hover:bg-[#21262d] hover:text-[#c9d1d9]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          {/* Emoji + Name */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setEmojiPickerOpen((v) => !v)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#30363d] bg-[#161b22] text-xl transition-colors hover:border-violet-500/40"
              >
                {blueprint.emoji}
              </button>
              {emojiPickerOpen && (
                <div className="absolute left-0 top-12 z-10 grid grid-cols-6 gap-1.5 rounded-xl border border-[#30363d] bg-[#161b22] p-2 shadow-xl">
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        update({ emoji: e });
                        setEmojiPickerOpen(false);
                      }}
                      className="rounded p-1 text-lg transition-colors hover:bg-[#21262d]"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input
              value={blueprint.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Agent name"
              className="flex-1 rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-[13px] font-semibold text-[#c9d1d9] placeholder-[#484f58] outline-none focus:border-violet-500/50"
            />
          </div>

          {/* Objective */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6e7681]">
              Objective
            </label>
            <input
              value={blueprint.objective}
              onChange={(e) => update({ objective: e.target.value })}
              placeholder="One-line description of this agent's role"
              className="w-full rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 text-[12px] text-[#c9d1d9] placeholder-[#484f58] outline-none focus:border-violet-500/50"
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6e7681]">
              System Prompt
            </label>
            <textarea
              value={blueprint.systemPrompt}
              onChange={(e) => update({ systemPrompt: e.target.value })}
              rows={5}
              className="w-full resize-none rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-2 font-mono text-[11px] text-[#c9d1d9] placeholder-[#484f58] outline-none focus:border-violet-500/50"
            />
          </div>

          {/* Permissions */}
          <div>
            <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[#6e7681]">
              Permissions
            </label>
            <div className="flex flex-wrap gap-2">
              <PermissionToggle
                icon={Terminal}
                label="Terminal"
                value={blueprint.permissions.terminal}
                onChange={(v) => update({ permissions: { ...blueprint.permissions, terminal: v } })}
              />
              <PermissionToggle
                icon={Globe}
                label="Browser"
                value={blueprint.permissions.browser}
                onChange={(v) => update({ permissions: { ...blueprint.permissions, browser: v } })}
              />
              <PermissionToggle
                icon={FileCode}
                label="Files"
                value={blueprint.permissions.files}
                onChange={(v) => update({ permissions: { ...blueprint.permissions, files: v } })}
              />
              <PermissionToggle
                icon={GitBranch}
                label="Git"
                value={blueprint.permissions.git}
                onChange={(v) => update({ permissions: { ...blueprint.permissions, git: v } })}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[#21262d] px-5 py-3">
          <Button variant="ghost" size="sm" onClick={handleClose} className="text-[#6e7681]">
            Dismiss
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            className="gap-1.5 bg-violet-600 text-white hover:bg-violet-500"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Agent
          </Button>
        </div>
      </div>
    </div>
  );
}
