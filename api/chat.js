const json = (response, status, body) => {
  response.status(status);
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
};

function buildSystemPrompt(agent = {}, route = {}) {
  const permissions = agent.permissions || {};
  const enabledTools = Object.entries(permissions)
    .filter(([, enabled]) => typeof enabled === "boolean" && Boolean(enabled))
    .map(([tool]) => tool)
    .join(", ");
  const enabledConnectors = Object.entries(permissions.connectors || {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([connector]) => connector)
    .join(", ");
  const enabledAutomations = Object.entries(permissions.automations || {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([automation]) => automation)
    .join(", ");
  const routedProvider = route.provider || agent.provider || "cloud";
  const routedModel = route.model || agent.model || "configured model";

  return [
    agent.systemPrompt?.trim() ||
      `You are ${agent.name || "an agent"}, a specialist inside a personal multi-agent workspace.`,
    agent.objective ? `Current objective: ${agent.objective}` : "",
    `Runtime route: ${routedProvider}/${routedModel}. If the user asks which model you are using, answer with this exact provider and model. Do not claim you are using GPT-4o unless the runtime route says GPT-4o.`,
    enabledTools ? `Enabled capabilities: ${enabledTools}.` : "Enabled capabilities: reasoning only.",
    enabledConnectors
      ? `Enabled connectors: ${enabledConnectors}. Use connector-aware behavior only through available browser, HTTP, git, file, terminal, cloud, or local bridge context. If auth is missing, say which credential is needed.`
      : "",
    enabledAutomations
      ? `Enabled automation triggers: ${enabledAutomations}. If an automation run asks for action, complete it and report the final status from actual output.`
      : "",
    permissions.terminal
      ? "You may request local terminal/file work through the user's local bridge, but do not claim you executed commands unless command results are explicitly present in the conversation."
      : "",
    agent.workspace ? `Workspace: ${agent.workspace}` : "",
    "Reply as the agent in the cloud. Do not mention queueing, bridge internals, Supabase, or local runtime status unless the user asks about infrastructure.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function normalizeConversation(messages = []) {
  const result = [];

  for (const message of messages) {
    if (!message || typeof message.content !== "string" || !message.content.trim()) {
      continue;
    }

    if (message.role === "system") {
      continue;
    }

    const role = message.role === "assistant" ? "assistant" : "user";
    const previous = result[result.length - 1];

    if (previous?.role === role) {
      previous.content = `${previous.content}\n\n${message.content.trim()}`;
      continue;
    }

    result.push({ role, content: message.content.trim() });
  }

  return result.length > 0
    ? result
    : [{ role: "user", content: "Introduce yourself and ask how you can help." }];
}

function openAiMessages(agent, conversation, route) {
  return [
    { role: "system", content: buildSystemPrompt(agent, route) },
    ...conversation.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

function geminiContents(conversation) {
  return conversation.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
}

function responsesInput(conversation) {
  return conversation.map((message) => ({
    role: message.role,
    content: [
      {
        type: message.role === "assistant" ? "output_text" : "input_text",
        text: message.content,
      },
    ],
  }));
}

const copilotModelAliases = new Map([
  ["gpt-4.1", "gpt-4.1"],
  ["gpt-5 mini", "gpt-5-mini"],
  ["gpt-5-mini", "gpt-5-mini"],
  ["gpt-5.1", "gpt-5.1"],
  ["gpt-5.1-codex", "gpt-5.1-codex"],
  ["gpt-5.1-codex-max", "gpt-5.1-codex-max"],
  ["gpt-5.1-codex-mini", "gpt-5.1-codex-mini"],
  ["gpt-5.2", "gpt-5.2"],
  ["gpt-5.2-codex", "gpt-5.2-codex"],
  ["gpt-5.3-codex", "gpt-5.3-codex"],
  ["gpt-5.4", "gpt-5.4"],
  ["gpt-5.4 mini", "gpt-5.4-mini"],
  ["gpt-5.4-mini", "gpt-5.4-mini"],
  ["claude-haiku-4.5", "claude-haiku-4.5"],
  ["claude-opus-4.5", "claude-opus-4.5"],
  ["claude-opus-4.6", "claude-opus-4.6"],
  ["claude-opus-4.6-fast-mode-preview", "claude-opus-4.6-fast-mode-preview"],
  ["claude-sonnet-4", "claude-sonnet-4"],
  ["claude-sonnet-4.5", "claude-sonnet-4.5"],
  ["claude-sonnet-4.6", "claude-sonnet-4.6"],
  ["gemini-2.5-pro", "gemini-2.5-pro"],
  ["gemini-3-flash", "gemini-3-flash"],
  ["gemini-3.1-pro", "gemini-3.1-pro"],
  ["grok-code-fast-1", "grok-code-fast-1"],
  ["raptor-mini", "raptor-mini"],
  ["goldeneye", "goldeneye"],
]);

let cachedCopilotToken = "";
let cachedCopilotTokenExpiresAt = 0;

function normalizeCopilotModel(agent = {}) {
  const normalized = `${agent.model || process.env.COPILOT_CHAT_MODEL || "gpt-4.1"}`
    .trim()
    .toLowerCase();
  return copilotModelAliases.get(normalized) || normalized;
}

function normalizeGitHubModel(agent = {}) {
  const model = `${agent.model || process.env.CLOUD_CHAT_MODEL || "openai/gpt-4.1"}`
    .trim()
    .toLowerCase();

  if (model.includes("codex")) {
    return "openai/gpt-4.1";
  }

  if (model.includes("/")) {
    return model;
  }

  if (model.startsWith("gpt-")) {
    return `openai/${model}`;
  }

  if (model.startsWith("claude-")) {
    return `anthropic/${model}`;
  }

  if (model.startsWith("gemini-")) {
    return `google/${model}`;
  }

  return "openai/gpt-4.1";
}

function normalizeGeminiModel(agent = {}) {
  const model = `${agent.model || process.env.CLOUD_CHAT_MODEL || ""}`.trim().toLowerCase();
  return model.startsWith("gemini-") ? model.replace(/^models\//, "") : "gemini-2.5-flash";
}

function normalizeOpenAIModel(agent = {}) {
  const model = `${agent.model || process.env.CLOUD_CHAT_MODEL || ""}`.trim();
  return model.toLowerCase().startsWith("gpt-") ? model : "gpt-4.1";
}

function normalizeGroqModel(agent = {}) {
  const model = `${agent.model || process.env.CLOUD_CHAT_MODEL || ""}`.trim();
  return model || "llama-3.3-70b-versatile";
}

function normalizeNvidiaModel(agent = {}) {
  const model = `${agent.model || process.env.NVIDIA_CHAT_MODEL || process.env.CLOUD_CHAT_MODEL || ""}`.trim();
  return model || "nvidia/llama-3.3-nemotron-super-49b-v1.5";
}

function extractResponsesText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  const textParts = [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];

    for (const part of content) {
      if (
        (part?.type === "output_text" || part?.type === "text" || !part?.type) &&
        typeof part?.text === "string" &&
        part.text.trim()
      ) {
        textParts.push(part.text.trim());
      }
    }
  }

  return textParts.join("\n\n");
}

async function parseError(response) {
  const text = await response.text();

  try {
    const payload = JSON.parse(text);
    return payload?.error?.message || payload?.error || payload?.message || text;
  } catch {
    return text || response.statusText;
  }
}

function extractChatText(payload) {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  const content = choice?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

function extractOpenAIResponseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  return output
    .flatMap((block) => (Array.isArray(block?.content) ? block.content : []))
    .map((item) => (typeof item?.text === "string" ? item.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
}

function extractGeminiText(payload) {
  const parts = Array.isArray(payload?.candidates?.[0]?.content?.parts)
    ? payload.candidates[0].content.parts
    : [];
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
}

async function callGitHubModels(agent, conversation) {
  const token = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_MODELS_TOKEN is missing.");
  const model = normalizeGitHubModel(agent);
  const route = { provider: "githubmodels", model };

  const response = await fetch("https://models.github.ai/inference/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      messages: openAiMessages(agent, conversation, route),
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub Models error: ${await parseError(response)}`);
  }

  const payload = await response.json();
  const text = extractChatText(payload);
  if (!text) throw new Error("GitHub Models returned an empty response.");
  return { text, provider: route.provider, model: route.model, usage: payload.usage ?? null };
}

async function callGemini(agent, conversation) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing.");
  const model = normalizeGeminiModel(agent);
  const route = { provider: "gemini", model };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: buildSystemPrompt(agent, route) }] },
        contents: geminiContents(conversation),
        generationConfig: { maxOutputTokens: 2048 },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini error: ${await parseError(response)}`);
  }

  const payload = await response.json();
  const text = extractGeminiText(payload);
  if (!text) throw new Error("Gemini returned an empty response.");
  return { text, provider: route.provider, model: route.model, usage: payload.usageMetadata ?? null };
}

async function ensureCopilotApiToken() {
  const now = Date.now();

  if (cachedCopilotToken && cachedCopilotTokenExpiresAt > now + 60_000) {
    return cachedCopilotToken;
  }

  const oauthToken =
    process.env.GITHUB_COPILOT_OAUTH_TOKEN?.trim() ||
    process.env.GITHUB_OAUTH_TOKEN?.trim() ||
    process.env.COPILOT_OAUTH_TOKEN?.trim() ||
    "";

  if (!oauthToken) {
    throw new Error("GITHUB_COPILOT_OAUTH_TOKEN is missing.");
  }

  const response = await fetch("https://api.github.com/copilot_internal/v2/token", {
    method: "GET",
    headers: {
      Authorization: `token ${oauthToken}`,
      Accept: "application/json",
      "User-Agent": "GithubCopilot/1.300.0",
      "Editor-Version": "vscode/1.100.0",
      "Editor-Plugin-Version": "copilot/1.300.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Copilot token exchange failed (${response.status}): ${await parseError(response)}`);
  }

  const payload = await response.json();
  const token = `${payload?.token || ""}`.trim();

  if (!token) {
    throw new Error("Copilot token exchange returned no token.");
  }

  cachedCopilotToken = token;
  cachedCopilotTokenExpiresAt = payload?.expires_at
    ? new Date(payload.expires_at * 1000).getTime()
    : now + 25 * 60_000;

  return cachedCopilotToken;
}

async function callCopilot(agent, conversation) {
  const token = await ensureCopilotApiToken();
  const model = normalizeCopilotModel(agent);
  const route = { provider: "copilot", model };
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Editor-Version": "vscode/1.100.0",
    "Editor-Plugin-Version": "copilot/1.300.0",
    "Openai-Organization": "github-copilot",
    "Copilot-Integration-Id": "vscode-chat",
    "User-Agent": "GithubCopilot/1.300.0",
  };
  const messages = openAiMessages(agent, conversation, route);

  const chatResponse = await fetch("https://api.githubcopilot.com/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      messages,
      stream: false,
    }),
  });

  if (chatResponse.ok) {
    const payload = await chatResponse.json();
    const text = extractChatText(payload);
    if (text) {
      return { text, provider: route.provider, model: route.model, usage: payload.usage ?? null };
    }
  }

  const chatError = await parseError(chatResponse).catch(() => "");
  const shouldTryResponses =
    chatResponse.status === 400 ||
    chatResponse.status === 404 ||
    `${chatError}`.toLowerCase().includes("not accessible") ||
    `${chatError}`.toLowerCase().includes("unsupported");

  if (!shouldTryResponses) {
    if (chatResponse.status === 401) {
      cachedCopilotToken = "";
      cachedCopilotTokenExpiresAt = 0;
    }
    throw new Error(`Copilot /chat/completions error: ${chatError}`);
  }

  const systemInstructions = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const nonSystemConversation = conversation.filter((message) => message.role !== "system");
  const responsesBody = {
    model,
    input:
      nonSystemConversation.length > 0
        ? responsesInput(nonSystemConversation)
        : "Help the user.",
    max_output_tokens: 1200,
    stream: false,
  };

  if (systemInstructions) {
    responsesBody.instructions = systemInstructions;
  }

  const responsesResponse = await fetch("https://api.githubcopilot.com/responses", {
    method: "POST",
    headers,
    body: JSON.stringify(responsesBody),
  });

  if (!responsesResponse.ok) {
    if (responsesResponse.status === 401) {
      cachedCopilotToken = "";
      cachedCopilotTokenExpiresAt = 0;
    }
    throw new Error(`Copilot /responses error: ${await parseError(responsesResponse)}`);
  }

  const payload = await responsesResponse.json();
  const text = extractResponsesText(payload);

  if (!text) {
    throw new Error("Copilot /responses returned an empty response.");
  }

  return { text, provider: route.provider, model: route.model, usage: payload.usage ?? null };
}

async function callOpenAI(agent, conversation) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing.");
  const model = normalizeOpenAIModel(agent);
  const route = { provider: "openai", model };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: buildSystemPrompt(agent, route),
      input: responsesInput(conversation),
      max_output_tokens: 1200,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI error: ${await parseError(response)}`);
  }

  const payload = await response.json();
  const text = extractOpenAIResponseText(payload);
  if (!text) throw new Error("OpenAI returned an empty response.");
  return { text, provider: route.provider, model: route.model, usage: payload.usage ?? null };
}

async function callGroq(agent, conversation) {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is missing.");
  const model = normalizeGroqModel(agent);
  const route = { provider: "groq", model };

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      messages: openAiMessages(agent, conversation, route),
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq error: ${await parseError(response)}`);
  }

  const payload = await response.json();
  const text = extractChatText(payload);
  if (!text) throw new Error("Groq returned an empty response.");
  return { text, provider: route.provider, model: route.model, usage: payload.usage ?? null };
}

async function callNvidia(agent, conversation) {
  if (!process.env.NVIDIA_API_KEY) throw new Error("NVIDIA_API_KEY is missing.");
  const model = normalizeNvidiaModel(agent);
  const route = { provider: "nvidia", model };

  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      messages: openAiMessages(agent, conversation, route),
    }),
  });

  if (!response.ok) {
    throw new Error(`NVIDIA error: ${await parseError(response)}`);
  }

  const payload = await response.json();
  const text = extractChatText(payload);
  if (!text) throw new Error("NVIDIA returned an empty response.");
  return { text, provider: route.provider, model: route.model, usage: payload.usage ?? null };
}

async function callOpenRouter(agent, conversation) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is missing.");
  const model = agent.model || process.env.CLOUD_CHAT_MODEL || "openai/gpt-4.1";
  const route = { provider: "openrouter", model };

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://openclaw-control-room.vercel.app",
      "X-Title": "Control Room",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      messages: openAiMessages(agent, conversation, route),
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${await parseError(response)}`);
  }

  const payload = await response.json();
  const text = extractChatText(payload);
  if (!text) throw new Error("OpenRouter returned an empty response.");
  return { text, provider: route.provider, model: route.model, usage: payload.usage ?? null };
}

function providerOrder(agent = {}) {
  const order = [];
  const hasAgentProvider = Boolean(`${agent.provider || ""}`.trim());
  const pushProvider = (value) => {
    const provider = `${value || ""}`.toLowerCase();

    if ((provider.includes("gemini") || provider.includes("google")) && !order.includes("gemini")) {
      order.push("gemini");
    }
    if (provider.includes("copilot") && !order.includes("copilot")) {
      order.push("copilot");
    }
    if (provider.includes("github") && !order.includes("githubmodels")) {
      order.push("githubmodels");
    }
    if (provider.includes("openai")) {
      if (!order.includes("openai")) order.push("openai");
      if (!order.includes("githubmodels")) order.push("githubmodels");
    }
    if (provider.includes("groq") && !order.includes("groq")) order.push("groq");
    if ((provider.includes("nvidia") || provider.includes("nim")) && !order.includes("nvidia")) {
      order.push("nvidia");
    }
    if (provider.includes("openrouter") && !order.includes("openrouter")) {
      order.push("openrouter");
    }
  };

  pushProvider(agent.provider);
  if (!hasAgentProvider) {
    pushProvider(process.env.CLOUD_CHAT_PROVIDER);
  }

  const fallbackProviders = hasAgentProvider
    ? []
    : ["githubmodels", "gemini", "groq", "nvidia", "openai", "openrouter"];

  for (const provider of fallbackProviders) {
    if (!order.includes(provider)) order.push(provider);
  }

  return order;
}

async function callCloudModel(agent, conversation) {
  const errors = [];

  for (const provider of providerOrder(agent)) {
    try {
      if (provider === "copilot") return await callCopilot(agent, conversation);
      if (provider === "gemini") return await callGemini(agent, conversation);
      if (provider === "githubmodels") return await callGitHubModels(agent, conversation);
      if (provider === "openai") return await callOpenAI(agent, conversation);
      if (provider === "groq") return await callGroq(agent, conversation);
      if (provider === "nvidia") return await callNvidia(agent, conversation);
      if (provider === "openrouter") return await callOpenRouter(agent, conversation);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors.join(" | ") || "No cloud chat provider is configured.");
}

export default async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.status(204);
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    json(response, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const body = request.body || {};
    const agent = body.agent || {};
    const conversation = normalizeConversation(body.messages);
    const result = await callCloudModel(agent, conversation);

    json(response, 200, {
      ok: true,
      ...result,
    });
  } catch (error) {
    json(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Cloud chat failed.",
    });
  }
}
