import { create } from "zustand";
import type { WorkspaceView } from "../App";

interface AppState {
  workspaceView: WorkspaceView;
  setWorkspaceView: (view: WorkspaceView) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  isActivityDrawerOpen: boolean;
  setIsActivityDrawerOpen: (isOpen: boolean) => void;
  activityPanelWidth: number;
  setActivityPanelWidth: (width: number) => void;
  activityDrawerTab: "activity" | "files" | "terminal" | "browser";
  setActivityDrawerTab: (tab: "activity" | "files" | "terminal" | "browser") => void;
  isCreateAgentOpen: boolean;
  setIsCreateAgentOpen: (isOpen: boolean) => void;
  editingAgentId: string | null;
  setEditingAgentId: (id: string | null) => void;
  isCreateChannelOpen: boolean;
  setIsCreateChannelOpen: (isOpen: boolean) => void;
  isDelegationOpen: boolean;
  setIsDelegationOpen: (isOpen: boolean) => void;
  showAllProviderPresets: boolean;
  setShowAllProviderPresets: (show: boolean) => void;
  isCopilotAuthDialogOpen: boolean;
  setIsCopilotAuthDialogOpen: (isOpen: boolean) => void;
  selectedFilePreviewPath: string | null;
  setSelectedFilePreviewPath: (path: string | null) => void;

  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (isOpen: boolean) => void;

  composerExpanded: boolean;
  setComposerExpanded: (expanded: boolean) => void;

  isAgentDropdownOpen: boolean;
  setIsAgentDropdownOpen: (isOpen: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  workspaceView: "chat",
  setWorkspaceView: (view) => set({ workspaceView: view }),
  
  sidebarWidth: 260,
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  
  isActivityDrawerOpen: true,
  setIsActivityDrawerOpen: (isOpen) => set({ isActivityDrawerOpen: isOpen }),

  activityPanelWidth: 420,
  setActivityPanelWidth: (width) => set({ activityPanelWidth: width }),
  
  activityDrawerTab: "activity",
  setActivityDrawerTab: (tab) => set({ activityDrawerTab: tab }),
  
  isCreateAgentOpen: false,
  setIsCreateAgentOpen: (isOpen) => set({ isCreateAgentOpen: isOpen }),
  
  editingAgentId: null,
  setEditingAgentId: (id) => set({ editingAgentId: id }),
  
  isCreateChannelOpen: false,
  setIsCreateChannelOpen: (isOpen) => set({ isCreateChannelOpen: isOpen }),
  
  isDelegationOpen: false,
  setIsDelegationOpen: (isOpen) => set({ isDelegationOpen: isOpen }),
  
  showAllProviderPresets: false,
  setShowAllProviderPresets: (show) => set({ showAllProviderPresets: show }),
  
  isCopilotAuthDialogOpen: false,
  setIsCopilotAuthDialogOpen: (isOpen) => set({ isCopilotAuthDialogOpen: isOpen }),

  selectedFilePreviewPath: null,
  setSelectedFilePreviewPath: (path) => set({ selectedFilePreviewPath: path }),

  isCommandPaletteOpen: false,
  setIsCommandPaletteOpen: (isOpen) => set({ isCommandPaletteOpen: isOpen }),

  composerExpanded: false,
  setComposerExpanded: (expanded) => set({ composerExpanded: expanded }),

  isAgentDropdownOpen: false,
  setIsAgentDropdownOpen: (isOpen) => set({ isAgentDropdownOpen: isOpen }),
}));
