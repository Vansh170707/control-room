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
          ? "border-[#c96437]/45 bg-[#c96437]/12 text-[#8f4b2d]"
          : "border-[#d7c8b7] bg-[#fffaf2] text-[#7d6b5a] hover:border-[#cfbda8] hover:bg-[#f7efe3] hover:text-[#2f261f]",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2f261f]/28 backdrop-blur-sm">
      <div
        className={cn(
          "relative w-full max-w-lg rounded-2xl border border-[#d7c8b7] bg-[#fbf7ef] text-[#2f261f] shadow-[0_24px_80px_rgba(120,71,35,0.22)]",
          "animate-in zoom-in-95 duration-200",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e0d2c0] bg-[#fffaf2] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#e0d2c0] bg-[#c96437]/10">
              <Sparkles className="h-4 w-4 text-[#c96437]" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#2f261f]">Agent Creator</p>
              <p className="text-[10px] text-[#8f7b66]">
                A new specialist was generated to fill a capability gap
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded p-1 text-[#8f7b66] transition-colors hover:bg-[#f7efe3] hover:text-[#2f261f]"
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
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d7c8b7] bg-[#fffaf2] text-xl transition-colors hover:border-[#c96437]/45"
              >
                {blueprint.emoji}
              </button>
              {emojiPickerOpen && (
                <div className="absolute left-0 top-12 z-10 grid grid-cols-6 gap-1.5 rounded-xl border border-[#d7c8b7] bg-[#fffaf2] p-2 shadow-[0_18px_50px_rgba(120,71,35,0.18)]">
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        update({ emoji: e });
                        setEmojiPickerOpen(false);
                      }}
                      className="rounded p-1 text-lg transition-colors hover:bg-[#f7efe3]"
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
              className="flex-1 rounded-lg border border-[#d7c8b7] bg-[#fffaf2] px-3 py-2 text-[13px] font-semibold text-[#2f261f] placeholder-[#9a8978] outline-none focus:border-[#c96437]/55"
            />
          </div>

          {/* Objective */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#8f7b66]">
              Objective
            </label>
            <input
              value={blueprint.objective}
              onChange={(e) => update({ objective: e.target.value })}
              placeholder="One-line description of this agent's role"
              className="w-full rounded-lg border border-[#d7c8b7] bg-[#fffaf2] px-3 py-2 text-[12px] text-[#2f261f] placeholder-[#9a8978] outline-none focus:border-[#c96437]/55"
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#8f7b66]">
              System Prompt
            </label>
            <textarea
              value={blueprint.systemPrompt}
              onChange={(e) => update({ systemPrompt: e.target.value })}
              rows={5}
              className="w-full resize-none rounded-lg border border-[#d7c8b7] bg-[#fffaf2] px-3 py-2 font-mono text-[11px] text-[#2f261f] placeholder-[#9a8978] outline-none focus:border-[#c96437]/55"
            />
          </div>

          {/* Permissions */}
          <div>
            <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[#8f7b66]">
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
        <div className="flex items-center justify-end gap-2 border-t border-[#e0d2c0] bg-[#fffaf2] px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="border-[#e0d2c0] text-[#7d6b5a] hover:border-[#d7c8b7] hover:bg-[#f7efe3] hover:text-[#2f261f]"
          >
            Dismiss
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            className="gap-1.5 border-[#c96437]/35 bg-[#c96437]/12 text-[#8f4b2d] hover:border-[#c96437]/45 hover:bg-[#c96437]/18"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Agent
          </Button>
        </div>
      </div>
    </div>
  );
}
