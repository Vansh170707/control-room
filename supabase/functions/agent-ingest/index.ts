import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

interface AgentPayload {
  id: string;
  name?: string;
  emoji?: string;
  subtitle?: string;
  type?: string;
  role?: string;
  accent?: string;
  status?: "active" | "idle" | "error" | "offline";
  currentActivity?: string;
  lastSeen?: string;
  tasksCompleted?: number;
  accuracy?: number;
  skills?: string[];
}

interface EventPayload {
  agentId?: string;
  action: string;
  emoji?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

interface LogPayload {
  agentId?: string;
  category: "observation" | "general" | "reminder" | "fyi";
  message: string;
  timestamp?: string;
}

interface CommandUpdatePayload {
  id: string;
  status?: "pending" | "dispatched" | "running" | "completed" | "failed" | "canceled";
  result?: Record<string, unknown>;
  updatedAt?: string;
  payload?: Record<string, unknown>;
}

interface IngestPayload {
  agent?: AgentPayload;
  events?: EventPayload[];
  logs?: LogPayload[];
  commandUpdates?: CommandUpdatePayload[];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const ingestSecret = Deno.env.get("CLAWBUDDY_INGEST_SECRET");

  if (!ingestSecret) {
    return json({ error: "Missing CLAWBUDDY_INGEST_SECRET" }, 500);
  }

  const providedSecret = request.headers.get("x-clawbuddy-secret");
  if (providedSecret !== ingestSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing Supabase environment variables" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let payload: IngestPayload;
  try {
    payload = (await request.json()) as IngestPayload;
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  if (!payload.agent && !payload.events?.length && !payload.logs?.length && !payload.commandUpdates?.length) {
    return json({ error: "Expected agent, events, logs, or commandUpdates in the request body" }, 400);
  }

  const nowIso = new Date().toISOString();
  const agentId = payload.agent?.id;
  const completedUpdates = payload.commandUpdates?.filter((update) => update.status === "completed").length ?? 0;
  let existingAgent:
    | {
        name: string;
        emoji: string;
        subtitle: string;
        type: string;
        role: string;
        accent: string;
        status: string;
        current_activity: string;
        last_seen: string;
        tasks_completed: number;
        accuracy: number;
        skills: string[];
      }
    | null = null;

  if (payload.agent) {
    const { data: currentAgent, error: currentAgentError } = await supabase
      .from("agents")
      .select("*")
      .eq("id", payload.agent.id)
      .maybeSingle();

    if (currentAgentError) {
      return json({ error: currentAgentError.message }, 500);
    }

    existingAgent = currentAgent
      ? {
          name: currentAgent.name,
          emoji: currentAgent.emoji,
          subtitle: currentAgent.subtitle,
          type: currentAgent.type,
          role: currentAgent.role,
          accent: currentAgent.accent,
          status: currentAgent.status,
          current_activity: currentAgent.current_activity,
          last_seen: currentAgent.last_seen,
          tasks_completed: currentAgent.tasks_completed,
          accuracy: Number(currentAgent.accuracy),
          skills: Array.isArray(currentAgent.skills)
            ? currentAgent.skills.filter((value): value is string => typeof value === "string")
            : [],
        }
      : null;

    const { error } = await supabase.from("agents").upsert(
      {
        id: payload.agent.id,
        name: payload.agent.name ?? existingAgent?.name ?? payload.agent.id,
        emoji: payload.agent.emoji ?? existingAgent?.emoji ?? "🤖",
        subtitle: payload.agent.subtitle ?? existingAgent?.subtitle ?? "Connected through agent-ingest",
        type: payload.agent.type ?? existingAgent?.type ?? "Connected Agent",
        role: payload.agent.role ?? existingAgent?.role ?? "Autonomous Worker",
        accent: payload.agent.accent ?? existingAgent?.accent ?? "#10b981",
        status: payload.agent.status ?? existingAgent?.status ?? "active",
        current_activity:
          payload.agent.currentActivity ?? existingAgent?.current_activity ?? "Listening for commands",
        last_seen: payload.agent.lastSeen ?? nowIso,
        tasks_completed:
          payload.agent.tasksCompleted ??
          ((existingAgent?.tasks_completed ?? 0) + completedUpdates),
        accuracy: payload.agent.accuracy ?? existingAgent?.accuracy ?? 0,
        skills: payload.agent.skills ?? existingAgent?.skills ?? [],
      },
      { onConflict: "id" },
    );

    if (error) {
      return json({ error: error.message }, 500);
    }
  }

  const eventRows =
    payload.events
      ?.map((event) => ({
        agent_id: event.agentId ?? agentId,
        action: event.action,
        emoji: event.emoji ?? null,
        metadata: event.metadata ?? {},
        created_at: event.timestamp ?? nowIso,
      }))
      .filter((event) => event.agent_id && event.action) ?? [];

  if (eventRows.length > 0) {
    const { error } = await supabase.from("agent_events").insert(eventRows);

    if (error) {
      return json({ error: error.message }, 500);
    }
  }

  const logRows =
    payload.logs
      ?.map((log) => ({
        agent_id: log.agentId ?? agentId,
        category: log.category,
        message: log.message,
        created_at: log.timestamp ?? nowIso,
      }))
      .filter((log) => log.agent_id && log.message) ?? [];

  if (logRows.length > 0) {
    const { error } = await supabase.from("ai_logs").insert(logRows);

    if (error) {
      return json({ error: error.message }, 500);
    }
  }

  const commandUpdates = payload.commandUpdates ?? [];
  for (const commandUpdate of commandUpdates) {
    const updatePayload: {
      updated_at: string;
      status?: CommandUpdatePayload["status"];
      result?: Record<string, unknown>;
    } = {
      updated_at: commandUpdate.updatedAt ?? nowIso,
    };

    if (commandUpdate.status) {
      updatePayload.status = commandUpdate.status;
    }

    if (commandUpdate.result) {
      updatePayload.result = commandUpdate.result;
    }

    const { error } = await supabase
      .from("agent_commands")
      .update(updatePayload)
      .eq("id", commandUpdate.id);

    if (error) {
      return json({ error: error.message }, 500);
    }

    // Council message routing: extract agent responses and insert into council_messages
    const isTerminal = commandUpdate.status === "completed" || commandUpdate.status === "failed";
    const councilSessionId = commandUpdate.payload?.councilSessionId;

    if (isTerminal && councilSessionId) {
      const result = commandUpdate.result ?? {};
      const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
      const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
      const errorMsg = typeof result.error === "string" ? result.error.trim() : "";

      // Take the first non-empty output source
      const content = stdout || stderr || errorMsg || "No response generated.";

      console.log(`[council] Inserting message for agent=${agentId} session=${councilSessionId} content_length=${content.length}`);

      const { error: councilError } = await supabase.from("council_messages").insert({
        session_id: councilSessionId,
        agent_id: agentId,
        content: content,
      });

      if (councilError) {
        console.error(`[council] Insert failed: ${councilError.message}`);
      }
    }
  }

  return json({
    ok: true,
    upsertedAgent: Boolean(payload.agent),
    insertedEvents: eventRows.length,
    insertedLogs: logRows.length,
    updatedCommands: commandUpdates.length,
  });
});
