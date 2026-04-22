import { create } from "zustand";
import type { WorkspaceAgent, PendingCommandApproval, ToolApprovalState } from "../App";
import type { RuntimeHealth } from "../lib/agent-runtime";

interface AgentState {
  customAgents: WorkspaceAgent[];
  setCustomAgents: (agents: WorkspaceAgent[] | ((prev: WorkspaceAgent[]) => WorkspaceAgent[])) => void;
  
  selectedAgentId: string;
  setSelectedAgentId: (id: string) => void;
  
  runtimeHealth: RuntimeHealth;
  setRuntimeHealth: (health: RuntimeHealth | ((prev: RuntimeHealth) => RuntimeHealth)) => void;

  commandApproval: PendingCommandApproval | null;
  setCommandApproval: (approval: PendingCommandApproval | null) => void;

  isProcessingCommandApproval: boolean;
  setIsProcessingCommandApproval: (isProcessing: boolean) => void;

  toolApproval: ToolApprovalState | null;
  setToolApproval: (approval: ToolApprovalState | null) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  customAgents: [],
  setCustomAgents: (updater) => set((state) => ({ 
    customAgents: typeof updater === 'function' ? updater(state.customAgents) : updater 
  })),

  selectedAgentId: "",
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),

  runtimeHealth: { ok: false, error: undefined, version: undefined },
  setRuntimeHealth: (updater) => set((state) => ({
    runtimeHealth: typeof updater === 'function' ? updater(state.runtimeHealth) : updater
  })),

  commandApproval: null,
  setCommandApproval: (approval) => set({ commandApproval: approval }),

  isProcessingCommandApproval: false,
  setIsProcessingCommandApproval: (isProcessing) => set({ isProcessingCommandApproval: isProcessing }),

  toolApproval: null,
  setToolApproval: (approval) => set({ toolApproval: approval }),
}));
