import { create } from "zustand";
import { randomUUID } from "@/lib/utils";
import type {
  ContextStats,
  ParallelBatch,
  ApprovalQueueItem,
  ApprovalDecision,
  AgentTrustPolicy,
} from "@/lib/phase3";
import { defaultTrustPolicy } from "@/lib/phase3";

interface Phase3State {
  // ------------------------------------------------------------------
  // Module 12 — Cognitive Load Manager
  // ------------------------------------------------------------------

  /** Live context window stats per agent */
  contextStatsByAgent: Record<string, ContextStats>;
  setContextStats: (agentId: string, stats: ContextStats) => void;

  /** Pinned message IDs per agent */
  pinnedIdsByAgent: Record<string, Set<string>>;
  pinMessage: (agentId: string, messageId: string) => void;
  unpinMessage: (agentId: string, messageId: string) => void;

  // ------------------------------------------------------------------
  // Module 13 — Parallel Execution Engine
  // ------------------------------------------------------------------

  /** Most-recent parallel batch per agent */
  parallelBatchByAgent: Record<string, ParallelBatch>;
  setParallelBatch: (agentId: string, batch: ParallelBatch) => void;
  updateParallelBatch: (
    agentId: string,
    batchId: string,
    updater: (prev: ParallelBatch) => ParallelBatch,
  ) => void;
  clearParallelBatch: (agentId: string) => void;

  // ------------------------------------------------------------------
  // Module 14 — HITL Gate Upgrade
  // ------------------------------------------------------------------

  /** Persistent queue of commands waiting for user decision */
  approvalQueue: ApprovalQueueItem[];
  enqueueApproval: (item: Omit<ApprovalQueueItem, "id" | "requestedAt">) => string;
  resolveApproval: (id: string, decision: ApprovalDecision) => void;
  dismissApproval: (id: string) => void;
  clearResolvedApprovals: () => void;

  /** Per-agent trust policies */
  trustPoliciesByAgent: Record<string, AgentTrustPolicy>;
  getTrustPolicy: (agentId: string) => AgentTrustPolicy;
  setTrustPolicy: (agentId: string, policy: Partial<AgentTrustPolicy>) => void;
  resetTrustPolicy: (agentId: string) => void;
}

export const usePhase3Store = create<Phase3State>((set, get) => ({
  // ------------------------------------------------------------------
  // Module 12
  // ------------------------------------------------------------------

  contextStatsByAgent: {},
  setContextStats: (agentId, stats) =>
    set((state) => ({
      contextStatsByAgent: { ...state.contextStatsByAgent, [agentId]: stats },
    })),

  pinnedIdsByAgent: {},
  pinMessage: (agentId, messageId) =>
    set((state) => {
      const prev = state.pinnedIdsByAgent[agentId] ?? new Set<string>();
      const next = new Set(prev);
      next.add(messageId);
      return { pinnedIdsByAgent: { ...state.pinnedIdsByAgent, [agentId]: next } };
    }),
  unpinMessage: (agentId, messageId) =>
    set((state) => {
      const prev = state.pinnedIdsByAgent[agentId] ?? new Set<string>();
      const next = new Set(prev);
      next.delete(messageId);
      return { pinnedIdsByAgent: { ...state.pinnedIdsByAgent, [agentId]: next } };
    }),

  // ------------------------------------------------------------------
  // Module 13
  // ------------------------------------------------------------------

  parallelBatchByAgent: {},
  setParallelBatch: (agentId, batch) =>
    set((state) => ({
      parallelBatchByAgent: { ...state.parallelBatchByAgent, [agentId]: batch },
    })),
  updateParallelBatch: (agentId, batchId, updater) =>
    set((state) => {
      const prev = state.parallelBatchByAgent[agentId];
      if (!prev || prev.id !== batchId) return state;
      return {
        parallelBatchByAgent: {
          ...state.parallelBatchByAgent,
          [agentId]: updater(prev),
        },
      };
    }),
  clearParallelBatch: (agentId) =>
    set((state) => {
      const next = { ...state.parallelBatchByAgent };
      delete next[agentId];
      return { parallelBatchByAgent: next };
    }),

  // ------------------------------------------------------------------
  // Module 14
  // ------------------------------------------------------------------

  approvalQueue: [],
  enqueueApproval: (item) => {
    const id = randomUUID();
    const full: ApprovalQueueItem = {
      ...item,
      id,
      requestedAt: new Date().toISOString(),
    };
    set((state) => ({ approvalQueue: [full, ...state.approvalQueue] }));
    return id;
  },
  resolveApproval: (id, decision) =>
    set((state) => ({
      approvalQueue: state.approvalQueue.map((item) =>
        item.id === id
          ? { ...item, decision, resolvedAt: new Date().toISOString() }
          : item,
      ),
    })),
  dismissApproval: (id) =>
    set((state) => ({
      approvalQueue: state.approvalQueue.filter((item) => item.id !== id),
    })),
  clearResolvedApprovals: () =>
    set((state) => ({
      approvalQueue: state.approvalQueue.filter((item) => !item.decision),
    })),

  trustPoliciesByAgent: {},
  getTrustPolicy: (agentId) => {
    return get().trustPoliciesByAgent[agentId] ?? defaultTrustPolicy(agentId);
  },
  setTrustPolicy: (agentId, partial) =>
    set((state) => {
      const prev = state.trustPoliciesByAgent[agentId] ?? defaultTrustPolicy(agentId);
      return {
        trustPoliciesByAgent: {
          ...state.trustPoliciesByAgent,
          [agentId]: {
            ...prev,
            ...partial,
            agentId,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    }),
  resetTrustPolicy: (agentId) =>
    set((state) => ({
      trustPoliciesByAgent: {
        ...state.trustPoliciesByAgent,
        [agentId]: defaultTrustPolicy(agentId),
      },
    })),
}));
