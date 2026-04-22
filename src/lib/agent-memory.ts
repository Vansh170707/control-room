import { supabase } from "@/lib/supabase";

export type MemoryType = "thread" | "note" | "variable" | "file_attachment" | "knowledge" | "summary";

export interface MemoryEntry {
  id: string;
  agentId: string;
  type: MemoryType;
  key: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  tokenCount: number | null;
}

export interface ThreadMemory {
  threadId: string;
  agentId: string;
  messages: ThreadMessage[];
  summary: string | null;
  summaryGeneratedAt: string | null;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sender: string;
  timestamp: string;
  tokens: number | null;
  metadata: Record<string, unknown>;
}

export interface AgentNote {
  id: string;
  agentId: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AttachedFile {
  id: string;
  agentId: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
  summary: string;
  attachedAt: string;
}

export interface KnowledgeEntry {
  id: string;
  agentId: string;
  title: string;
  content: string;
  source: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

const runtimeBaseUrl = import.meta.env.VITE_AGENT_RUNTIME_URL?.replace(/\/$/, "") ?? "";
const hasMemoryRuntime = Boolean(runtimeBaseUrl);

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || response.statusText || "Memory request failed");
  }
  return payload;
}

export async function getThreadMemory(agentId: string): Promise<{ ok: boolean; thread?: ThreadMemory; error?: string }> {
  if (!hasMemoryRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/memory/${encodeURIComponent(agentId)}/thread`);
    return await parseJsonResponse<{ ok: boolean; thread: ThreadMemory }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to get thread memory." };
  }
}

export async function appendThreadMessage(agentId: string, message: Omit<ThreadMessage, "id">): Promise<{ ok: boolean; error?: string }> {
  if (!hasMemoryRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/memory/${encodeURIComponent(agentId)}/thread`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    return await parseJsonResponse<{ ok: boolean; error?: string }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to append message." };
  }
}

export async function summarizeThread(agentId: string): Promise<{ ok: boolean; summary?: string; error?: string }> {
  if (!hasMemoryRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/memory/${encodeURIComponent(agentId)}/thread/summarize`, {
      method: "POST",
    });
    return await parseJsonResponse<{ ok: boolean; summary: string }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to summarize thread." };
  }
}

export async function listAgentNotes(agentId: string, query?: string): Promise<{ ok: boolean; notes?: AgentNote[]; error?: string }> {
  if (!hasMemoryRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const params = query ? `?q=${encodeURIComponent(query)}` : "";
    const response = await fetch(`${runtimeBaseUrl}/v1/memory/${encodeURIComponent(agentId)}/notes${params}`);
    return await parseJsonResponse<{ ok: boolean; notes: AgentNote[] }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to list notes." };
  }
}

export async function createAgentNote(agentId: string, title: string, content: string, tags: string[] = []): Promise<{ ok: boolean; note?: AgentNote; error?: string }> {
  if (!hasMemoryRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/memory/${encodeURIComponent(agentId)}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, tags }),
    });
    return await parseJsonResponse<{ ok: boolean; note: AgentNote }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to create note." };
  }
}

export async function deleteAgentNote(agentId: string, noteId: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasMemoryRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/memory/${encodeURIComponent(agentId)}/notes/${encodeURIComponent(noteId)}`, {
      method: "DELETE",
    });
    return await parseJsonResponse<{ ok: boolean; error?: string }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to delete note." };
  }
}

export async function listKnowledge(agentId: string, query?: string): Promise<{ ok: boolean; entries?: KnowledgeEntry[]; error?: string }> {
  if (!hasMemoryRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const params = query ? `?q=${encodeURIComponent(query)}` : "";
    const response = await fetch(`${runtimeBaseUrl}/v1/memory/${encodeURIComponent(agentId)}/knowledge${params}`);
    return await parseJsonResponse<{ ok: boolean; entries: KnowledgeEntry[] }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to list knowledge." };
  }
}

export async function addKnowledge(agentId: string, title: string, content: string, source: string, tags: string[] = []): Promise<{ ok: boolean; entry?: KnowledgeEntry; error?: string }> {
  if (!hasMemoryRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/memory/${encodeURIComponent(agentId)}/knowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, source, tags }),
    });
    return await parseJsonResponse<{ ok: boolean; entry: KnowledgeEntry }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to add knowledge." };
  }
}

export async function listAttachedFiles(agentId: string): Promise<{ ok: boolean; files?: AttachedFile[]; error?: string }> {
  if (!hasMemoryRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/memory/${encodeURIComponent(agentId)}/files`);
    return await parseJsonResponse<{ ok: boolean; files: AttachedFile[] }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to list attached files." };
  }
}

export async function attachFile(agentId: string, name: string, path: string, mimeType: string, size: number, summary: string): Promise<{ ok: boolean; file?: AttachedFile; error?: string }> {
  if (!hasMemoryRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/memory/${encodeURIComponent(agentId)}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, path, mimeType, size, summary }),
    });
    return await parseJsonResponse<{ ok: boolean; file: AttachedFile }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to attach file." };
  }
}

// ---------------------------------------------------------------------------
// Phase 3 — Module 12: Pinned Anchor Points
// ---------------------------------------------------------------------------

export async function getPinnedMessages(agentId: string): Promise<{ ok: boolean; pinnedMessageIds?: string[]; error?: string }> {
  if (!hasMemoryRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/memory/${encodeURIComponent(agentId)}/pinned`);
    return await parseJsonResponse<{ ok: boolean; pinnedMessageIds: string[] }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to get pinned messages." };
  }
}

export async function pinMessage(agentId: string, messageId: string): Promise<{ ok: boolean; pinnedMessageIds?: string[]; error?: string }> {
  if (!hasMemoryRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/memory/${encodeURIComponent(agentId)}/pinned`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    return await parseJsonResponse<{ ok: boolean; pinnedMessageIds: string[] }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to pin message." };
  }
}

export async function unpinMessage(agentId: string, messageId: string): Promise<{ ok: boolean; pinnedMessageIds?: string[]; error?: string }> {
  if (!hasMemoryRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(
      `${runtimeBaseUrl}/v1/memory/${encodeURIComponent(agentId)}/pinned/${encodeURIComponent(messageId)}`,
      { method: "DELETE" },
    );
    return await parseJsonResponse<{ ok: boolean; pinnedMessageIds: string[] }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to unpin message." };
  }
}
export async function generateEmbedding(text: string): Promise<number[]> {
  // TODO: Connect this placeholder to your actual Embedding Provider 
  // (e.g., OpenAI text-embedding-3-small, or a Supabase Edge Function).
  // For demonstration, returns an empty array which would be a 1536-dim vector.
  console.warn("generateEmbedding is a placeholder. Please connect your embedding API.");
  return new Array(1536).fill(0).map(() => Math.random());
}

export async function semanticSearchMemory(
  agentId: string, 
  query: string, 
  matchCount: number = 5
) {
  if (!supabase) {
    return { ok: false, error: "Supabase client is not configured for vector search." };
  }

  try {
    const queryEmbedding = await generateEmbedding(query);

    const { data: memories, error } = await (supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }).rpc("match_agent_memory", {
      query_embedding: queryEmbedding as any,
      match_threshold: 0.7, // Adjust threshold as needed
      match_count: matchCount,
      p_agent_id: agentId,
    });

    if (error) {
      throw error;
    }

    return { ok: true, memories };
  } catch (err) {
    return { 
      ok: false, 
      error: err instanceof Error ? err.message : "Semantic memory search failed." 
    };
  }
}
