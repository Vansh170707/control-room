import { supabase } from "@/lib/supabase";

export interface IssueAgentCommandInput {
  agentId: string;
  command: string;
  payload?: Record<string, unknown>;
  requestedBy?: string;
  secret?: string;
}

export async function issueAgentCommand(input: IssueAgentCommandInput) {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  const { data, error } = await supabase.functions.invoke("issue-command", {
    headers: input.secret
      ? {
          "x-clawbuddy-secret": input.secret,
        }
      : undefined,
    body: input,
  });

  if (error) {
    throw error;
  }

  return data;
}
