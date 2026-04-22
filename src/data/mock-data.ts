export type AgentStatus = "active" | "idle" | "error" | "offline";
export type LogCategory = "observation" | "general" | "reminder" | "fyi";
export type TaskStatus = "todo" | "doing" | "needs-input" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type CouncilStatus = "active" | "resolved" | "watching";
export type ParticipantStatus = "speaking" | "waiting" | "complete";
export type MeetingType =
  | "standup"
  | "sales"
  | "interview"
  | "all-hands"
  | "1-on-1"
  | "planning"
  | "team";

export interface Agent {
  id: string;
  emoji: string;
  name: string;
  subtitle: string;
  type: string;
  role: string;
  accent: string;
  status: AgentStatus;
  currentActivity: string;
  lastSeen: string;
  tasksCompleted: number;
  accuracy: number;
  skills: string[];
}

export interface ActivityItem {
  id: string;
  agentId: string;
  emoji: string;
  action: string;
  timestamp: string;
}

export interface Task {
  id: string;
  title: string;
  agentId: string;
  status: TaskStatus;
  progress?: number;
  priority: TaskPriority;
}

export interface LogEntry {
  id: string;
  agentId: string;
  category: LogCategory;
  message: string;
  timestamp: string;
}

export interface CouncilParticipant {
  agentId: string;
  sent: number;
  limit: number;
  status: ParticipantStatus;
}

export interface CouncilMessage {
  id: string;
  agentId: string;
  messageNumber: number;
  content: string;
  timestamp: string;
}

export interface CouncilSession {
  id: string;
  question: string;
  status: CouncilStatus;
  participants: CouncilParticipant[];
  messages: CouncilMessage[];
}

export interface MeetingActionItem {
  task: string;
  assignee: string;
  done: boolean;
}

export interface Meeting {
  id: string;
  type: "meeting";
  title: string;
  date: string;
  duration_minutes: number;
  duration_display: string;
  attendees: string[];
  summary: string;
  action_items: MeetingActionItem[];
  ai_insights: string;
  meeting_type: MeetingType;
  sentiment: "positive" | "neutral" | "mixed";
  has_external_participants: boolean;
  external_domains: string[];
  fathom_url: string | null;
  share_url: string | null;
}

export const agents: Agent[] = [];
export const activityFeed: ActivityItem[] = [];
export const tasks: Task[] = [];
export const logEntries: LogEntry[] = [];
export const councilSessions: CouncilSession[] = [];
export const meetings: Meeting[] = [];
