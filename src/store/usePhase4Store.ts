import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HandoffSignal, HandoffRecord } from "@/lib/router/types";
import {
  DEFAULT_DIGITAL_TWIN_PROFILE,
  mergeProfileUpdate,
  createLearningEvent,
  buildReflectionReport,
  type DigitalTwinProfile,
  type LearningEvent,
  type LearningEventType,
  type ReflectionReport,
  type AgentBlueprint,
} from "@/lib/phase4";
import { randomUUID } from "@/lib/utils";

interface Phase4State {
  // ------------------------------------------------------------------
  // Module 15 — Collaboration Protocol
  // ------------------------------------------------------------------

  /** All handoff records this session */
  handoffHistory: HandoffRecord[];
  /** Currently pending incoming handoffs, keyed by toAgentId */
  activeHandoffs: Record<string, HandoffSignal>;

  enqueueHandoff: (signal: HandoffSignal) => void;
  resolveHandoff: (toAgentId: string, status: HandoffRecord["status"]) => void;
  clearHandoffHistory: () => void;

  // ------------------------------------------------------------------
  // Module 16 — Dynamic Agent Creator
  // ------------------------------------------------------------------

  /** Pending blueprint waiting for user review/confirmation */
  pendingBlueprint: AgentBlueprint | null;
  setPendingBlueprint: (blueprint: AgentBlueprint | null) => void;
  isAgentCreatorOpen: boolean;
  setIsAgentCreatorOpen: (open: boolean) => void;

  // ------------------------------------------------------------------
  // Module 17 — Meta-Reflection Loop
  // ------------------------------------------------------------------

  learningEvents: LearningEvent[];
  reflectionsByAgent: Record<string, ReflectionReport>;
  promptPatchesByAgent: Record<string, string>;

  addLearningEvent: (
    agentId: string,
    agentName: string,
    type: LearningEventType,
    description: string,
    metadata?: Record<string, unknown>,
  ) => void;
  refreshReflection: (agentId: string) => ReflectionReport;
  setPromptPatch: (agentId: string, patch: string) => void;
  clearLearningEvents: (agentId?: string) => void;

  // ------------------------------------------------------------------
  // Module 18 — Digital Twin Profile
  // ------------------------------------------------------------------

  digitalTwinProfile: DigitalTwinProfile;
  updateProfile: (patch: Partial<DigitalTwinProfile>) => void;
  resetProfile: () => void;
}

export const usePhase4Store = create<Phase4State>()(
  persist(
    (set, get) => ({
      // ------------------------------------------------------------------
      // Module 15
      // ------------------------------------------------------------------

      handoffHistory: [],
      activeHandoffs: {},

      enqueueHandoff: (signal) =>
        set((state) => ({
          handoffHistory: [
            { signal, status: "pending" },
            ...state.handoffHistory,
          ],
          activeHandoffs: {
            ...state.activeHandoffs,
            [signal.toAgentId]: signal,
          },
        })),

      resolveHandoff: (toAgentId, status) =>
        set((state) => {
          const signal = state.activeHandoffs[toAgentId];
          if (!signal) return state;

          const next = { ...state.activeHandoffs };
          delete next[toAgentId];

          return {
            activeHandoffs: next,
            handoffHistory: state.handoffHistory.map((record) =>
              record.signal.id === signal.id
                ? { ...record, status, resolvedAt: new Date().toISOString() }
                : record,
            ),
          };
        }),

      clearHandoffHistory: () =>
        set({ handoffHistory: [], activeHandoffs: {} }),

      // ------------------------------------------------------------------
      // Module 16
      // ------------------------------------------------------------------

      pendingBlueprint: null,
      setPendingBlueprint: (blueprint) => set({ pendingBlueprint: blueprint }),

      isAgentCreatorOpen: false,
      setIsAgentCreatorOpen: (open) => set({ isAgentCreatorOpen: open }),

      // ------------------------------------------------------------------
      // Module 17
      // ------------------------------------------------------------------

      learningEvents: [],
      reflectionsByAgent: {},
      promptPatchesByAgent: {},

      addLearningEvent: (agentId, agentName, type, description, metadata) => {
        const event = createLearningEvent(agentId, agentName, type, description, metadata);
        set((state) => ({ learningEvents: [...state.learningEvents, event] }));
        // Auto-refresh reflection for this agent
        get().refreshReflection(agentId);
      },

      refreshReflection: (agentId) => {
        const events = get().learningEvents;
        const report = buildReflectionReport(agentId, events);
        set((state) => ({
          reflectionsByAgent: { ...state.reflectionsByAgent, [agentId]: report },
        }));
        return report;
      },

      setPromptPatch: (agentId, patch) =>
        set((state) => ({
          promptPatchesByAgent: { ...state.promptPatchesByAgent, [agentId]: patch },
        })),

      clearLearningEvents: (agentId) =>
        set((state) => {
          const filtered = agentId
            ? state.learningEvents.filter((e) => e.agentId !== agentId)
            : [];
          return { learningEvents: filtered };
        }),

      // ------------------------------------------------------------------
      // Module 18
      // ------------------------------------------------------------------

      digitalTwinProfile: DEFAULT_DIGITAL_TWIN_PROFILE,

      updateProfile: (patch) =>
        set((state) => ({
          digitalTwinProfile: mergeProfileUpdate(state.digitalTwinProfile, patch),
        })),

      resetProfile: () => set({ digitalTwinProfile: DEFAULT_DIGITAL_TWIN_PROFILE }),
    }),
    {
      name: "phase4-store",
      // Only persist the Digital Twin profile and learning events across sessions
      partialize: (state) => ({
        digitalTwinProfile: state.digitalTwinProfile,
        learningEvents: state.learningEvents.slice(-200), // keep last 200
        promptPatchesByAgent: state.promptPatchesByAgent,
      }),
    },
  ),
);
