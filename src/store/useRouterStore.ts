import { create } from "zustand";
import type { RouterDecision } from "@/lib/router/types";

export interface ThreadRouteTurn {
  id: string;
  agentId: string;
  userMessageId: string;
  request: string;
  decision: RouterDecision;
  openedChannelId?: string | null;
  createdAt: string;
}

interface RouterState {
  threadTurnsByAgent: Record<string, ThreadRouteTurn[]>;
  setThreadTurnsByAgent: (
    updater:
      | Record<string, ThreadRouteTurn[]>
      | ((prev: Record<string, ThreadRouteTurn[]>) => Record<string, ThreadRouteTurn[]>),
  ) => void;
  latestChannelDecisionById: Record<string, RouterDecision>;
  setLatestChannelDecisionById: (
    updater:
      | Record<string, RouterDecision>
      | ((prev: Record<string, RouterDecision>) => Record<string, RouterDecision>),
  ) => void;
}

export const useRouterStore = create<RouterState>((set) => ({
  threadTurnsByAgent: {},
  setThreadTurnsByAgent: (updater) =>
    set((state) => ({
      threadTurnsByAgent:
        typeof updater === "function" ? updater(state.threadTurnsByAgent) : updater,
    })),
  latestChannelDecisionById: {},
  setLatestChannelDecisionById: (updater) =>
    set((state) => ({
      latestChannelDecisionById:
        typeof updater === "function" ? updater(state.latestChannelDecisionById) : updater,
    })),
}));
