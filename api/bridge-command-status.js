const json = (response, status, body) => {
  response.status(status);
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Clawbuddy-Secret, X-Clawbuddy-Client-Secret",
  );
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
};

const headerValue = (request, name) => {
  const headers = request.headers || {};
  if (typeof headers.get === "function") {
    return headers.get(name);
  }

  const value =
    headers[name.toLowerCase()] ||
    headers[name] ||
    headers[name.replace(/(^|-)([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`)];
  return Array.isArray(value) ? value[0] : value;
};

const normalizeSecret = (value) =>
  String(value || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");

export default async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.status(204);
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Clawbuddy-Secret, X-Clawbuddy-Client-Secret",
    );
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    json(response, 405, { error: "Method not allowed" });
    return;
  }

  const supabaseUrl = process.env.CLAWBUDDY_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const ingestSecret = process.env.CLAWBUDDY_INGEST_SECRET;

  if (!supabaseUrl || !ingestSecret) {
    json(response, 500, { error: "Cloud bridge server is not configured." });
    return;
  }

  const clientSecret =
    headerValue(request, "x-clawbuddy-secret") ||
    headerValue(request, "x-clawbuddy-client-secret");

  if (normalizeSecret(clientSecret) !== normalizeSecret(ingestSecret)) {
    json(response, 401, {
      error:
        "Cloud bridge owner secret is required before command status can be read.",
    });
    return;
  }

  const body = request.body || {};
  const commandId = typeof body.commandId === "string" ? body.commandId.trim() : "";

  if (!commandId) {
    json(response, 400, { error: "commandId is required" });
    return;
  }

  const functionUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/command-status`;
  const upstream = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-clawbuddy-secret": ingestSecret,
    },
    body: JSON.stringify({ commandId }),
  });

  const text = await upstream.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || "Invalid upstream response" };
  }

  json(response, upstream.status, payload);
}
