import { create } from "zustand";
import type { CriticResult } from "@/lib/phase2";

export interface ReasoningSnapshot {
  thought: string;
  observation?: string;
  command?: string;
  updatedAt: string;
}

export interface MemorySnapshot {
  summary: string;
  notes: string[];
  knowledge: string[];
  updatedAt: string;
}

interface ReasoningState {
  latestThoughtByAgentId: Record<string, ReasoningSnapshot>;
  setLatestThoughtByAgentId: (
    updater:
      | Record<string, ReasoningSnapshot>
      | ((prev: Record<string, ReasoningSnapshot>) => Record<string, ReasoningSnapshot>),
  ) => void;
  latestCriticByAgentId: Record<string, CriticResult>;
  setLatestCriticByAgentId: (
    updater:
      | Record<string, CriticResult>
      | ((prev: Record<string, CriticResult>) => Record<string, CriticResult>),
  ) => void;
  latestMemoryByAgentId: Record<string, MemorySnapshot>;
  setLatestMemoryByAgentId: (
    updater:
      | Record<string, MemorySnapshot>
      | ((prev: Record<string, MemorySnapshot>) => Record<string, MemorySnapshot>),
  ) => void;
}

export const useReasoningStore = create<ReasoningState>((set) => ({
  latestThoughtByAgentId: {},
  setLatestThoughtByAgentId: (updater) =>
    set((state) => ({
      latestThoughtByAgentId:
        typeof updater === "function" ? updater(state.latestThoughtByAgentId) : updater,
    })),
  latestCriticByAgentId: {},
  setLatestCriticByAgentId: (updater) =>
    set((state) => ({
      latestCriticByAgentId:
        typeof updater === "function" ? updater(state.latestCriticByAgentId) : updater,
    })),
  latestMemoryByAgentId: {},
  setLatestMemoryByAgentId: (updater) =>
    set((state) => ({
      latestMemoryByAgentId:
        typeof updater === "function" ? updater(state.latestMemoryByAgentId) : updater,
    })),
}));
