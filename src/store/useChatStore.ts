import { create } from "zustand";
import type { 
  CollaborationChannel, 
  ChannelMessage, 
  ChatMessage, 
  DelegationTask, 
  ComposerAttachment,
  ChannelDraft,
  AgentDraft,
  DelegationDraft
} from "../App";

interface ChatState {
  chatDraft: string;
  setChatDraft: (draft: string) => void;
  channelDraft: ChannelDraft;
  setChannelDraft: (draft: ChannelDraft | ((prev: ChannelDraft) => ChannelDraft)) => void;
  councilDraft: string;
  setCouncilDraft: (draft: string) => void;
  councilReplyDraft: string;
  setCouncilReplyDraft: (draft: string) => void;
  channelComposer: string;
  setChannelComposer: (draft: string) => void;
  
  chatDraftAttachments: ComposerAttachment[];
  setChatDraftAttachments: (attachments: ComposerAttachment[] | ((prev: ComposerAttachment[]) => ComposerAttachment[])) => void;
  channelDraftAttachments: ComposerAttachment[];
  setChannelDraftAttachments: (attachments: ComposerAttachment[] | ((prev: ComposerAttachment[]) => ComposerAttachment[])) => void;
  
  channels: CollaborationChannel[];
  setChannels: (channels: CollaborationChannel[] | ((prev: CollaborationChannel[]) => CollaborationChannel[])) => void;
  
  channelMessagesById: Record<string, ChannelMessage[]>;
  setChannelMessagesById: (updater: Record<string, ChannelMessage[]> | ((prev: Record<string, ChannelMessage[]>) => Record<string, ChannelMessage[]>)) => void;
  
  messagesByAgent: Record<string, ChatMessage[]>;
  setMessagesByAgent: (updater: Record<string, ChatMessage[]> | ((prev: Record<string, ChatMessage[]>) => Record<string, ChatMessage[]>)) => void;

  delegations: DelegationTask[];
  setDelegations: (updater: DelegationTask[] | ((prev: DelegationTask[]) => DelegationTask[])) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  chatDraft: "",
  setChatDraft: (draft) => set({ chatDraft: draft }),
  channelDraft: {
    title: "",
    objective: "",
    leadAgentId: "",
    memberAgentIds: [],
    memberTargets: {},
  },
  setChannelDraft: (updater) => set((state) => ({
    channelDraft: typeof updater === 'function' ? updater(state.channelDraft) : updater
  })),
  councilDraft: "",
  setCouncilDraft: (draft) => set({ councilDraft: draft }),
  councilReplyDraft: "",
  setCouncilReplyDraft: (draft) => set({ councilReplyDraft: draft }),
  channelComposer: "",
  setChannelComposer: (draft) => set({ channelComposer: draft }),
  
  chatDraftAttachments: [],
  setChatDraftAttachments: (updater) => set((state) => ({
    chatDraftAttachments: typeof updater === 'function' ? updater(state.chatDraftAttachments) : updater
  })),
  channelDraftAttachments: [],
  setChannelDraftAttachments: (updater) => set((state) => ({
    channelDraftAttachments: typeof updater === 'function' ? updater(state.channelDraftAttachments) : updater
  })),
  
  channels: [],
  setChannels: (updater) => set((state) => ({
    channels: typeof updater === 'function' ? updater(state.channels) : updater
  })),

  channelMessagesById: {},
  setChannelMessagesById: (updater) => set((state) => ({
    channelMessagesById: typeof updater === 'function' ? updater(state.channelMessagesById) : updater
  })),

  messagesByAgent: {},
  setMessagesByAgent: (updater) => set((state) => ({
    messagesByAgent: typeof updater === 'function' ? updater(state.messagesByAgent) : updater
  })),

  delegations: [],
  setDelegations: (updater) => set((state) => ({
    delegations: typeof updater === 'function' ? updater(state.delegations) : updater
  })),
}));
