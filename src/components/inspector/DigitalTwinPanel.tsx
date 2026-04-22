import React, { useState } from "react";
import { User, Plus, X, RefreshCw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePhase4Store } from "@/store/usePhase4Store";
import { Button } from "@/components/ui/button";

interface DigitalTwinPanelProps {
  className?: string;
}

const CODING_STYLE_OPTIONS = [
  "clean, well-commented",
  "terse, no comments",
  "verbose, lots of documentation",
  "functional, immutable",
  "object-oriented",
  "test-driven",
];

const LANG_OPTIONS = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Rust",
  "Java",
  "C++",
  "Swift",
];

function TechChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full border border-white/10 bg-[#1a2030] px-2.5 py-1 text-[11px] font-medium text-[#e6edf3]">
      {label}
      <button
        onClick={onRemove}
        className="ml-0.5 opacity-50 transition-opacity hover:opacity-100"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

export function DigitalTwinPanel({ className }: DigitalTwinPanelProps) {
  const { digitalTwinProfile, updateProfile, resetProfile } = usePhase4Store();
  const [techInput, setTechInput] = useState("");
  const [saved, setSaved] = useState(false);

  const profile = digitalTwinProfile;

  function addTech() {
    const trimmed = techInput.trim();
    if (!trimmed || profile.techStack.includes(trimmed)) return;
    updateProfile({ techStack: [...profile.techStack, trimmed] });
    setTechInput("");
  }

  function removeTech(tech: string) {
    updateProfile({ techStack: profile.techStack.filter((t) => t !== tech) });
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const isActive =
    profile.techStack.length > 0 || profile.workflowNotes.trim().length > 0;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-[#3b82f6]" />
          <span className="text-[13px] font-semibold text-[#e6edf3]">
            Digital Twin Profile
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Active
            </span>
          )}
          <button
            onClick={() => resetProfile()}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[#8fa1b3] transition-colors hover:bg-white/10 hover:text-[#e6edf3]"
            title="Reset to defaults"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Active badge */}
      {isActive && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-400">
          ✓ Profile is injected into all agent conversations automatically.
        </div>
      )}

      {/* Tech Stack */}
      <div className="rounded-lg border border-white/[0.08] bg-[#0b0f14] p-3">
        <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[#8fa1b3]">
          Tech Stack
        </label>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {profile.techStack.map((tech) => (
            <TechChip key={tech} label={tech} onRemove={() => removeTech(tech)} />
          ))}
          {profile.techStack.length === 0 && (
            <p className="text-[11px] text-[#4f6880]">No technologies added yet</p>
          )}
        </div>
        <div className="flex gap-1.5">
          <input
            value={techInput}
            onChange={(e) => setTechInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTech()}
            placeholder="e.g. React, Supabase, Python"
            className="flex-1 rounded-md border border-white/10 bg-[#1a2030] px-2.5 py-1.5 text-[11px] text-[#e6edf3] placeholder-[#4f6880] outline-none focus:border-[#3b82f6]/50"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={addTech}
            disabled={!techInput.trim()}
            className="h-7 px-2 text-[#3b82f6] hover:bg-[#3b82f6]/10"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Coding Style */}
      <div className="rounded-lg border border-white/[0.08] bg-[#0b0f14] p-3">
        <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[#8fa1b3]">
          Coding Style
        </label>
        <div className="flex flex-wrap gap-1.5">
          {CODING_STYLE_OPTIONS.map((style) => (
            <button
              key={style}
              onClick={() => updateProfile({ codingStyle: style })}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition-all",
                profile.codingStyle === style
                  ? "border-[#3b82f6]/50 bg-[#3b82f6]/10 text-[#60a5fa]"
                  : "border-white/10 bg-[#1a2030] text-[#8fa1b3] hover:border-[#4f6880] hover:text-[#e6edf3]",
              )}
            >
              {style}
            </button>
          ))}
        </div>
      </div>

      {/* Preferred Language */}
      <div className="rounded-lg border border-white/[0.08] bg-[#0b0f14] p-3">
        <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[#8fa1b3]">
          Preferred Language
        </label>
        <div className="flex flex-wrap gap-1.5">
          {LANG_OPTIONS.map((lang) => (
            <button
              key={lang}
              onClick={() => updateProfile({ preferredLanguage: lang })}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-mono transition-all",
                profile.preferredLanguage === lang
                  ? "border-[#3b82f6]/50 bg-[#3b82f6]/10 text-[#60a5fa]"
                  : "border-white/10 bg-[#1a2030] text-[#8fa1b3] hover:border-[#4f6880]",
              )}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

      {/* Workflow Notes */}
      <div className="rounded-lg border border-white/[0.08] bg-[#0b0f14] p-3">
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[#8fa1b3]">
          Workflow Notes
        </label>
        <textarea
          value={profile.workflowNotes}
          onChange={(e) => updateProfile({ workflowNotes: e.target.value })}
          rows={3}
          placeholder="e.g. I prefer short responses. Always include a summary line. Focus on production-ready code."
          className="w-full resize-none rounded-md border border-white/10 bg-[#1a2030] px-2.5 py-2 text-[11px] text-[#e6edf3] placeholder-[#4f6880] outline-none focus:border-[#3b82f6]/50"
        />
      </div>

      {/* Timezone */}
      <div className="rounded-lg border border-white/[0.08] bg-[#0b0f14] p-3">
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[#8fa1b3]">
          Timezone
        </label>
        <input
          value={profile.timezone}
          onChange={(e) => updateProfile({ timezone: e.target.value })}
          className="w-full rounded-md border border-white/10 bg-[#1a2030] px-2.5 py-1.5 text-[11px] font-mono text-[#e6edf3] outline-none focus:border-[#3b82f6]/50"
        />
      </div>

      {/* Save confirmation */}
      <div className="flex items-center justify-end">
        {saved && (
          <span className="mr-3 flex items-center gap-1 text-[11px] text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Saved
          </span>
        )}
        <Button size="sm" variant="secondary" onClick={handleSave} className="h-7 px-3 text-[11px]">
          Save Profile
        </Button>
      </div>
    </div>
  );
}
