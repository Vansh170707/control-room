import { useEffect, useState } from "react";
import {
  activityFeed as mockActivityFeed,
  agents as mockAgents,
  logEntries as mockLogEntries,
  type ActivityItem,
  type Agent,
  type AgentStatus,
  type LogCategory,
  type LogEntry,
  type CouncilSession,
  type CouncilParticipant,
  type CouncilMessage,
  councilSessions as mockCouncilSessions
} from "@/data/mock-data";
import { hasSupabaseConfig, supabase, type Database } from "@/lib/supabase";
import type { Json } from "@/lib/supabase-types";
import { issueAgentCommand } from "@/lib/commands";

export type CommandCenterDataMode = "mock" | "connecting" | "live" | "fallback";

interface SaveAgentProfileInput {
  agentId: string;
  name: string;
  role: string;
}

type AgentRow = Database["public"]["Tables"]["agents"]["Row"];
type AgentEventRow = Database["public"]["Tables"]["agent_events"]["Row"];
type AiLogRow = Database["public"]["Tables"]["ai_logs"]["Row"];

type CouncilSessionRow = {
  id: string;
  question: string;
  status: "active" | "resolved" | "watching";
  created_at: string;
};

type CouncilMessageRow = {
  id: string;
  session_id: string;
  agent_id: string;
  message_number: number;
  content: string;
  created_at: string;
};

const defaultCouncilAgentIds = ["main", "pi2work", "reacher"] as const;

const councilAgentDefaults: Record<
  string,
  {
    name: string;
    emoji: string;
    subtitle: string;
    type: string;
    role: string;
    accent: string;
    status: AgentStatus;
    currentActivity: string;
  }
> = {
  main: {
    name: "Main",
    emoji: "🧭",
    subtitle: "Strategic council lead",
    type: "Council Agent",
    role: "Lead Strategist",
    accent: "#10b981",
    status: "active",
    currentActivity: "Reviewing council discussions",
  },
  pi2work: {
    name: "Pi2Work",
    emoji: "🛠️",
    subtitle: "Technical implementation voice",
    type: "Council Agent",
    role: "Engineering Specialist",
    accent: "#38bdf8",
    status: "active",
    currentActivity: "Working through implementation tradeoffs",
  },
  reacher: {
    name: "Reacher",
    emoji: "🔎",
    subtitle: "Evidence and research specialist",
    type: "Council Agent",
    role: "Research Analyst",
    accent: "#f59e0b",
    status: "active",
    currentActivity: "Gathering supporting context",
  },
  human: {
    name: "Human",
    emoji: "🙂",
    subtitle: "Workspace operator",
    type: "Operator",
    role: "Human Operator",
    accent: "#a78bfa",
    status: "active",
    currentActivity: "Participating in council",
  },
};

function asStringArray(value: Json): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asAgentStatus(value: string): AgentStatus {
  return value === "active" || value === "idle" || value === "error" || value === "offline"
    ? value
    : "offline";
}

function asLogCategory(value: string): LogCategory {
  return value === "observation" || value === "general" || value === "reminder" || value === "fyi"
    ? value
    : "general";
}

function mapAgentRow(row: AgentRow): Agent {
  return {
    id: row.id,
    emoji: row.emoji,
    name: row.name,
    subtitle: row.subtitle,
    type: row.type,
    role: row.role,
    accent: row.accent,
    status: asAgentStatus(row.status),
    currentActivity: row.current_activity,
    lastSeen: row.last_seen,
    tasksCompleted: row.tasks_completed,
    accuracy: Number(row.accuracy),
    skills: asStringArray(row.skills),
  };
}

function mapAgentEventRow(row: AgentEventRow): ActivityItem {
  return {
    id: row.id,
    agentId: row.agent_id,
    emoji: row.emoji ?? "",
    action: row.action,
    timestamp: row.created_at,
  };
}

function mapAiLogRow(row: AiLogRow): LogEntry {
  return {
    id: row.id,
    agentId: row.agent_id,
    category: asLogCategory(row.category),
    message: row.message,
    timestamp: row.created_at,
  };
}

async function ensureCouncilAgents(agentIds: string[]) {
  if (!supabase) {
    return;
  }

  const rows = agentIds.map((agentId) => {
    const defaults = councilAgentDefaults[agentId] ?? {
      name: agentId,
      emoji: "🤖",
      subtitle: "Connected council participant",
      type: "Council Agent",
      role: "Council Member",
      accent: "#10b981",
      status: "active" as const,
      currentActivity: "Waiting for council input",
    };

    return {
      id: agentId,
      name: defaults.name,
      emoji: defaults.emoji,
      subtitle: defaults.subtitle,
      type: defaults.type,
      role: defaults.role,
      accent: defaults.accent,
      status: defaults.status,
      current_activity: defaults.currentActivity,
      last_seen: new Date().toISOString(),
      tasks_completed: 0,
      accuracy: 100,
      skills: [],
    };
  });

  const { error } = await supabase.from("agents").upsert(rows, { onConflict: "id" });

  if (error) {
    throw error;
  }
}

export function useCommandCenterData() {
  const [agents, setAgents] = useState<Agent[]>(mockAgents);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>(mockActivityFeed);
  const [aiLogs, setAiLogs] = useState<LogEntry[]>(mockLogEntries);
  const [councilSessions, setCouncilSessions] = useState<CouncilSession[]>(mockCouncilSessions);
  const [dataMode, setDataMode] = useState<CommandCenterDataMode>(
    hasSupabaseConfig ? "connecting" : "mock",
  );
  const [backendError, setBackendError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;

    if (!client) {
      return;
    }

    const liveClient = client;

    let isActive = true;

    async function loadAgents() {
      const { data, error } = await liveClient
        .from("agents")
        .select("*")
        .order("name", { ascending: true });

      if (!isActive) {
        return;
      }

      if (error) {
        throw error;
      }

      const rows = ((data ?? []) as AgentRow[]).filter(r => !["alpha", "dispatch", "audit"].includes(r.id));
      setAgents(rows.length > 0 ? rows.map(mapAgentRow) : mockAgents);
    }

    async function loadActivityFeed() {
      const { data, error } = await liveClient
        .from("agent_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (!isActive) {
        return;
      }

      if (error) {
        throw error;
      }

      const rows = ((data ?? []) as AgentEventRow[]).filter(r => !["alpha", "dispatch", "audit"].includes(r.agent_id));
      setActivityFeed(rows.length > 0 ? rows.map(mapAgentEventRow) : mockActivityFeed);
    }

    async function loadAiLogs() {
      const { data, error } = await liveClient
        .from("ai_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(40);

      if (!isActive) {
        return;
      }

      if (error) {
        throw error;
      }

      const rows = ((data ?? []) as AiLogRow[]).filter(r => !["alpha", "dispatch", "audit"].includes(r.agent_id));
      setAiLogs(rows.length > 0 ? rows.map(mapAiLogRow) : mockLogEntries);
    }

    async function loadCouncil() {
      const [sessionsRes, messagesRes] = await Promise.all([
        liveClient.from("council_sessions").select("*").order("created_at", { ascending: false }),
        liveClient.from("council_messages").select("*").order("message_number", { ascending: true })
      ]);

      if (!isActive) return;
      if (sessionsRes.error) throw sessionsRes.error;
      if (messagesRes.error) throw messagesRes.error;

      const sessionRows = (sessionsRes.data ?? []) as CouncilSessionRow[];
      const messageRows = (messagesRes.data ?? []) as CouncilMessageRow[];

      const mappedSessions: CouncilSession[] = sessionRows.map(row => {
        const sm = messageRows.filter(m => m.session_id === row.id);
        const participantAgentIds = Array.from(
          new Set([
            ...defaultCouncilAgentIds,
            ...sm
              .map((message) => message.agent_id)
              .filter((agentId) => agentId !== "human"),
          ]),
        );

        const participants: CouncilParticipant[] = participantAgentIds.map(aid => {
          const sentCount = sm.filter(m => m.agent_id === aid).length;
          return {
            agentId: aid,
            status: sentCount > 0 ? "complete" : "waiting",
            sent: sentCount,
            limit: 1
          };
        });

        const messages: CouncilMessage[] = sm.map(m => ({
          id: m.id,
          agentId: m.agent_id,
          messageNumber: m.message_number,
          content: m.content,
          timestamp: m.created_at
        }));

        return {
          id: row.id,
          question: row.question,
          status: row.status,
          participants,
          messages
        };
      });

      setCouncilSessions(mappedSessions.length > 0 ? mappedSessions : mockCouncilSessions);
    }

    async function syncFromSupabase() {
      try {
        await Promise.all([loadAgents(), loadActivityFeed(), loadAiLogs(), loadCouncil()]);

        if (!isActive) {
          return;
        }

        setBackendError(null);
        setDataMode("live");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setDataMode("fallback");
        setBackendError(error instanceof Error ? error.message : "Failed to sync live data.");
      }
    }

    void syncFromSupabase();

    const channel = liveClient
      .channel("clawbuddy-command-center")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agents" },
        () => void loadAgents().catch(() => void syncFromSupabase()),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_events" },
        () => void loadActivityFeed().catch(() => void syncFromSupabase()),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_logs" },
        () => void loadAiLogs().catch(() => void syncFromSupabase()),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "council_sessions" },
        () => void loadCouncil().catch(() => void syncFromSupabase()),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "council_messages" },
        () => void loadCouncil().catch(() => void syncFromSupabase()),
      )
      .subscribe();

    return () => {
      isActive = false;
      void liveClient.removeChannel(channel);
    };
  }, []);

  async function saveAgentProfile({ agentId, name, role }: SaveAgentProfileInput) {
    const client = supabase;

    if (!client || dataMode === "mock" || dataMode === "fallback") {
      setAgents((currentAgents) =>
        currentAgents.map((agent) =>
          agent.id === agentId
            ? {
                ...agent,
                name,
                role,
              }
            : agent,
        ),
      );

      return { ok: true as const, persisted: false as const };
    }

    const liveClient = client;

    const { error } = await liveClient
      .from("agents")
      .update({
        name,
        role,
      })
      .eq("id", agentId);

    if (error) {
      setBackendError(error.message);
      return { ok: false as const, persisted: false as const, error: error.message };
    }

    setAgents((currentAgents) =>
      currentAgents.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              name,
              role,
            }
          : agent,
      ),
    );

    return { ok: true as const, persisted: true as const };
  }

  async function issueCommand({ agentId, command, secret, payload }: { agentId: string; command: string; secret?: string; payload?: Record<string, unknown> }) {
    if (dataMode === "mock" || dataMode === "fallback") {
      setActivityFeed((current) => [
        {
          id: String(Date.now()),
          agentId,
          emoji: "🚀",
          action: `mocked command: ${command}`,
          timestamp: new Date().toISOString(),
        },
        ...current,
      ]);
      return { ok: true as const };
    }

    try {
      await issueAgentCommand({
        agentId,
        command,
        payload: payload ?? { label: `Manual command via Dashboard (${command})` },
        requestedBy: "dashboard-user",
        secret,
      });

      return { ok: true as const };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to issue command";
      setBackendError(msg);
      return { ok: false as const, error: msg };
    }
  }

  const councilPersonas: Record<string, { role: string; style: string }> = {
    main: {
      role: "Lead Strategist",
      style: "You focus on big-picture strategy, risks, and tradeoffs. You challenge assumptions and push for clarity.",
    },
    pi2work: {
      role: "Engineering Specialist",
      style: "You focus on technical feasibility, implementation details, and practical constraints. You suggest concrete solutions.",
    },
    reacher: {
      role: "Research Analyst",
      style: "You focus on data, evidence, and thorough analysis. You bring context from similar problems and reference best practices.",
    },
  };

  async function startCouncil(question: string) {
    if (!supabase) return { ok: false, error: "No database connection" };
    
    try {
      const targets = [...defaultCouncilAgentIds];

      await ensureCouncilAgents([...targets, "human"]);

      const { data: session, error } = await supabase.from("council_sessions").insert({ question }).select().single();
      if (error) throw error;

      const otherNames = (id: string) => targets.filter(t => t !== id).join(", ");

      for (const agentId of targets) {
        const persona = councilPersonas[agentId] ?? { role: "Council Member", style: "Provide your unique perspective." };
        issueCommand({
          agentId,
          command: `ask: You are "${agentId}" (${persona.role}) in a group council discussion with agents: ${otherNames(agentId)}, and a Human operator.

${persona.style}

COUNCIL TOPIC: "${question}"

Share your initial thoughts on this topic. Be concise (2-4 sentences). The other agents will see your response and may react to it.`,
          payload: { councilSessionId: session.id, label: "Council Debate" },
        }).catch(console.error);
      }

      return { ok: true, sessionId: session.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start council";
      setBackendError(msg);
      return { ok: false, error: msg };
    }
  }

  async function sendCouncilMessage(sessionId: string, message: string) {
    if (!supabase) return { ok: false, error: "No database connection" };

    try {
      await ensureCouncilAgents(["human", ...defaultCouncilAgentIds]);

      // Insert the human message
      const { error: humanMsgError } = await supabase.from("council_messages").insert({
        session_id: sessionId,
        agent_id: "human",
        content: message,
      });
      if (humanMsgError) throw humanMsgError;

      // Get the session question for context
      const { data: sessionData } = await supabase
        .from("council_sessions")
        .select("question")
        .eq("id", sessionId)
        .single();

      // Get conversation history for context
      const { data: history } = await supabase
        .from("council_messages")
        .select("agent_id, content")
        .eq("session_id", sessionId)
        .order("message_number", { ascending: true })
        .limit(30);

      const context = (history ?? [])
        .map(m => {
          const label = m.agent_id === "human" ? "Human" : `${m.agent_id} (${councilPersonas[m.agent_id]?.role ?? "Agent"})`;
          return `[${label}]: ${m.content}`;
        })
        .join("\n\n");

      // Re-dispatch to all agents with full conversation context
      const targets = [...defaultCouncilAgentIds];

      for (const agentId of targets) {
        const persona = councilPersonas[agentId] ?? { role: "Council Member", style: "Provide your unique perspective." };
        const otherNames = targets.filter(t => t !== agentId).join(", ");

        issueCommand({
          agentId,
          command: `ask: You are "${agentId}" (${persona.role}) in a group council discussion with agents: ${otherNames}, and a Human operator.

${persona.style}

ORIGINAL TOPIC: "${sessionData?.question ?? "Unknown"}"

CONVERSATION SO FAR:
${context}

INSTRUCTIONS:
- Read what the other agents (${otherNames}) and the Human said above.
- Respond to the latest message, but also react to or build on what the OTHER AGENTS said. Agree, disagree, or add nuance.
- Address other agents by name when referencing their points.
- Be concise and conversational (2-4 sentences).`,
          payload: { councilSessionId: sessionId, label: "Council Reply" },
        }).catch(console.error);
      }

      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send message";
      setBackendError(msg);
      return { ok: false, error: msg };
    }
  }

  return {
    agents,
    activityFeed,
    aiLogs,
    councilSessions,
    dataMode,
    backendError,
    hasSupabaseConfig,
    saveAgentProfile,
    issueCommand,
    startCouncil,
    sendCouncilMessage,
  };
}
