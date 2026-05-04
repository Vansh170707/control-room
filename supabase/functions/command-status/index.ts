import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

interface CommandStatusPayload {
  commandId: string;
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

  let payload: CommandStatusPayload;
  try {
    payload = (await request.json()) as CommandStatusPayload;
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  const commandId = `${payload.commandId || ""}`.trim();
  if (!commandId) {
    return json({ error: "commandId is required" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from("agent_commands")
    .select("*")
    .eq("id", commandId)
    .single();

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json({ ok: true, command: data });
});
