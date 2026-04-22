import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CircuitBreakerEvent,
  ContextPackage,
  DispatcherDecision,
  KnowledgeGraph,
  PlanReviewRequest,
  TaskTree,
  ToolDraft,
  VerifierReview,
} from "@/lib/orchestration";

interface OrchestrationState {
  dispatcherDecisions: DispatcherDecision[];
  contextPackagesByAgent: Record<string, ContextPackage>;
  taskTrees: TaskTree[];
  verifierReviews: VerifierReview[];
  planReviews: PlanReviewRequest[];
  circuitBreakerEvents: CircuitBreakerEvent[];
  knowledgeGraphByAgent: Record<string, KnowledgeGraph>;
  toolDrafts: ToolDraft[];

  addDispatcherDecision: (decision: DispatcherDecision) => void;
  setContextPackage: (agentId: string, contextPackage: ContextPackage) => void;
  upsertTaskTree: (taskTree: TaskTree) => void;
  updateTaskTree: (taskTreeId: string, updater: (taskTree: TaskTree) => TaskTree) => void;
  addVerifierReview: (review: VerifierReview) => void;
  upsertPlanReview: (review: PlanReviewRequest) => void;
  resolvePlanReview: (reviewId: string, status: "approved" | "rejected") => void;
  addCircuitBreakerEvent: (event: CircuitBreakerEvent) => void;
  setKnowledgeGraph: (agentId: string, graph: KnowledgeGraph) => void;
  upsertToolDraft: (draft: ToolDraft) => void;
  hydrateFromRemote: (payload: {
    dispatcherDecisions?: DispatcherDecision[];
    contextPackagesByAgent?: Record<string, ContextPackage>;
    taskTrees?: TaskTree[];
    verifierReviews?: VerifierReview[];
    planReviews?: PlanReviewRequest[];
    circuitBreakerEvents?: CircuitBreakerEvent[];
    knowledgeGraphByAgent?: Record<string, KnowledgeGraph>;
    toolDrafts?: ToolDraft[];
  }) => void;
}

export const useOrchestrationStore = create<OrchestrationState>()(
  persist(
    (set) => ({
      dispatcherDecisions: [],
      contextPackagesByAgent: {},
      taskTrees: [],
      verifierReviews: [],
      planReviews: [],
      circuitBreakerEvents: [],
      knowledgeGraphByAgent: {},
      toolDrafts: [],

      addDispatcherDecision: (decision) =>
        set((state) => ({
          dispatcherDecisions: [decision, ...state.dispatcherDecisions].slice(0, 80),
        })),

      setContextPackage: (agentId, contextPackage) =>
        set((state) => ({
          contextPackagesByAgent: {
            ...state.contextPackagesByAgent,
            [agentId]: contextPackage,
          },
        })),

      upsertTaskTree: (taskTree) =>
        set((state) => {
          const existingIndex = state.taskTrees.findIndex(
            (candidate) => candidate.id === taskTree.id,
          );
          if (existingIndex === -1) {
            return { taskTrees: [taskTree, ...state.taskTrees].slice(0, 40) };
          }
          const next = [...state.taskTrees];
          next[existingIndex] = taskTree;
          return { taskTrees: next };
        }),

      updateTaskTree: (taskTreeId, updater) =>
        set((state) => ({
          taskTrees: state.taskTrees.map((taskTree) =>
            taskTree.id === taskTreeId ? updater(taskTree) : taskTree,
          ),
        })),

      addVerifierReview: (review) =>
        set((state) => ({
          verifierReviews: [review, ...state.verifierReviews].slice(0, 80),
        })),

      upsertPlanReview: (review) =>
        set((state) => {
          const existingIndex = state.planReviews.findIndex(
            (candidate) => candidate.id === review.id,
          );
          if (existingIndex === -1) {
            return { planReviews: [review, ...state.planReviews].slice(0, 30) };
          }
          const next = [...state.planReviews];
          next[existingIndex] = review;
          return { planReviews: next };
        }),

      resolvePlanReview: (reviewId, status) =>
        set((state) => ({
          planReviews: state.planReviews.map((review) =>
            review.id === reviewId
              ? {
                  ...review,
                  status,
                  decidedAt: new Date().toISOString(),
                }
              : review,
          ),
        })),

      addCircuitBreakerEvent: (event) =>
        set((state) => ({
          circuitBreakerEvents: [event, ...state.circuitBreakerEvents].slice(0, 40),
        })),

      setKnowledgeGraph: (agentId, graph) =>
        set((state) => ({
          knowledgeGraphByAgent: {
            ...state.knowledgeGraphByAgent,
            [agentId]: graph,
          },
        })),

      upsertToolDraft: (draft) =>
        set((state) => {
          const existingIndex = state.toolDrafts.findIndex(
            (candidate) => candidate.id === draft.id,
          );
          if (existingIndex === -1) {
            return { toolDrafts: [draft, ...state.toolDrafts].slice(0, 60) };
          }
          const next = [...state.toolDrafts];
          next[existingIndex] = draft;
          return { toolDrafts: next };
        }),

      hydrateFromRemote: (payload) =>
        set((state) => ({
          dispatcherDecisions:
            payload.dispatcherDecisions ?? state.dispatcherDecisions,
          contextPackagesByAgent:
            payload.contextPackagesByAgent ?? state.contextPackagesByAgent,
          taskTrees: payload.taskTrees ?? state.taskTrees,
          verifierReviews: payload.verifierReviews ?? state.verifierReviews,
          planReviews: payload.planReviews ?? state.planReviews,
          circuitBreakerEvents:
            payload.circuitBreakerEvents ?? state.circuitBreakerEvents,
          knowledgeGraphByAgent:
            payload.knowledgeGraphByAgent ?? state.knowledgeGraphByAgent,
          toolDrafts: payload.toolDrafts ?? state.toolDrafts,
        })),
    }),
    {
      name: "orchestration-store",
      partialize: (state) => ({
        dispatcherDecisions: state.dispatcherDecisions.slice(0, 20),
        contextPackagesByAgent: state.contextPackagesByAgent,
        taskTrees: state.taskTrees.slice(0, 12),
        verifierReviews: state.verifierReviews.slice(0, 20),
        planReviews: state.planReviews.slice(0, 12),
        circuitBreakerEvents: state.circuitBreakerEvents.slice(0, 12),
        knowledgeGraphByAgent: state.knowledgeGraphByAgent,
        toolDrafts: state.toolDrafts.slice(0, 12),
      }),
    },
  ),
);
