import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

interface ClaimCommandPayload {
  agentId: string;
}

function isClaimedCommand(value: unknown): value is { id: string; command: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "command" in value &&
      typeof (value as { id?: unknown }).id === "string" &&
      typeof (value as { command?: unknown }).command === "string",
  );
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

  let payload: ClaimCommandPayload;
  try {
    payload = (await request.json()) as ClaimCommandPayload;
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  if (!payload.agentId) {
    return json({ error: "agentId is required" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase.rpc("claim_next_agent_command", {
    p_agent_id: payload.agentId,
  });

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json({
    ok: true,
    command: isClaimedCommand(data) ? data : null,
  });
});
