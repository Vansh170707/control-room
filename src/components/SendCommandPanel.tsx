import { useState } from "react";
import { Send, TerminalSquare, AlertCircle, MessageCircle, Terminal } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import type { Agent } from "@/data/mock-data";

interface SendCommandPanelProps {
  agent: Agent | null;
  onSend: (params: { agentId: string; command: string; secret: string }) => Promise<{ ok: boolean; error?: string }>;
}

export function SendCommandPanel({ agent, onSend }: SendCommandPanelProps) {
  const [command, setCommand] = useState("");
  const [secret, setSecret] = useState(
    () => localStorage.getItem("clawbuddy-ingest-secret") || ""
  );
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState<"chat" | "terminal">("chat");

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent || !command.trim() || !secret.trim()) return;

    setIsSending(true);
    setError(null);
    setSuccess(false);

    // Save secret for future ease of use
    localStorage.setItem("clawbuddy-ingest-secret", secret.trim());

    try {
      const payloadCommand = mode === "chat" && !command.startsWith("ask:") && !command.startsWith("chat:") 
        ? `ask: ${command.trim()}` 
        : command.trim();

      const result = await onSend({ agentId: agent.id, command: payloadCommand, secret: secret.trim() });
      if (!result.ok) {
        throw new Error(result.error || "Failed to enqueue command");
      }
      setSuccess(true);
      setCommand("");
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSending(false);
    }
  };

  if (!agent) {
    return (
      <div className="glass-card flex h-40 flex-col items-center justify-center rounded-2xl border-dashed border-white/20 p-6 text-center">
        <TerminalSquare className="mb-2 h-8 w-8 text-secondaryText/50" />
        <p className="text-secondaryText">Select an agent to send commands</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-5 shadow-emerald">
      <div className="mb-4 flex items-center gap-3">
        <div 
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-lg"
          style={{ border: `1px solid ${agent.accent}40` }}
        >
          {agent.emoji}
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Direct Command</h3>
          <p className="text-xs text-secondaryText">Dispatch task to {agent.name}</p>
        </div>
      </div>

      <form onSubmit={handleSend} className="space-y-4">
        <div className="flex bg-black/40 rounded-lg p-1 w-full relative">
          <button 
            type="button"
            onClick={() => setMode("chat")} 
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-xs rounded-md transition-colors ${mode === "chat" ? 'bg-white/10 text-white font-medium' : 'text-white/50 hover:text-white/80'}`}
          >
            <MessageCircle className="h-3 w-3" /> Chat
          </button>
          <button 
            type="button"
            onClick={() => setMode("terminal")} 
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-xs rounded-md transition-colors ${mode === "terminal" ? 'bg-white/10 text-white font-medium' : 'text-white/50 hover:text-white/80'}`}
          >
            <Terminal className="h-3 w-3" /> Terminal
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-mutedText">
            {mode === "chat" ? "Message" : "Command"}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mutedText">
              {mode === "chat" ? <MessageCircle className="h-4 w-4" /> : "$"}
            </span>
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={mode === "chat" ? "Ask the agent anything..." : "npm run build, etc."}
              className={`pl-9 bg-black/20 ${mode === "terminal" ? "font-mono text-sm" : ""}`}
              disabled={isSending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-mutedText">
              Ingest Secret
            </label>
            <Badge variant="muted" className="text-[10px]">Required</Badge>
          </div>
          <Input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="CLAWBUDDY_INGEST_SECRET"
            className="bg-black/20 font-mono text-sm"
            disabled={isSending}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-danger/10 p-3 text-sm text-danger-text">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <Button 
          type="submit" 
          disabled={!command.trim() || !secret.trim() || isSending || agent.status === "offline"}
          className="w-full justify-center"
          style={!isSending && command.trim() ? { backgroundColor: agent.accent, color: '#fff' } : undefined}
        >
          {isSending ? (
            <span className="animate-pulse">Dispatching...</span>
          ) : success ? (
            "Command enqueued!"
          ) : (
            <>
              Send to {agent.name} <Send className="h-4 w-4 ml-1" />
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
