export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agent_commands: {
        Row: {
          agent_id: string
          command: string
          created_at: string
          created_by: string | null
          id: string
          payload: Json
          result: Json
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          command: string
          created_at?: string
          created_by?: string | null
          id?: string
          payload?: Json
          result?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          command?: string
          created_at?: string
          created_by?: string | null
          id?: string
          payload?: Json
          result?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_commands_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_events: {
        Row: {
          action: string
          agent_id: string
          created_at: string
          emoji: string | null
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          agent_id: string
          created_at?: string
          emoji?: string | null
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          agent_id?: string
          created_at?: string
          emoji?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agent_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          accent: string
          accuracy: number
          created_at: string
          current_activity: string
          emoji: string
          id: string
          last_seen: string
          name: string
          role: string
          skills: Json
          status: string
          subtitle: string
          tasks_completed: number
          type: string
          updated_at: string
        }
        Insert: {
          accent?: string
          accuracy?: number
          created_at?: string
          current_activity?: string
          emoji?: string
          id: string
          last_seen?: string
          name: string
          role: string
          skills?: Json
          status?: string
          subtitle?: string
          tasks_completed?: number
          type: string
          updated_at?: string
        }
        Update: {
          accent?: string
          accuracy?: number
          created_at?: string
          current_activity?: string
          emoji?: string
          id?: string
          last_seen?: string
          name?: string
          role?: string
          skills?: Json
          status?: string
          subtitle?: string
          tasks_completed?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_logs: {
        Row: {
          agent_id: string
          category: string
          created_at: string
          id: string
          message: string
        }
        Insert: {
          agent_id: string
          category: string
          created_at?: string
          id?: string
          message: string
        }
        Update: {
          agent_id?: string
          category?: string
          created_at?: string
          id?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      council_messages: {
        Row: {
          agent_id: string
          content: string
          created_at: string
          id: string
          message_number: number
          session_id: string
        }
        Insert: {
          agent_id: string
          content: string
          created_at?: string
          id?: string
          message_number?: never
          session_id: string
        }
        Update: {
          agent_id?: string
          content?: string
          created_at?: string
          id?: string
          message_number?: never
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "council_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "council_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "council_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      council_sessions: {
        Row: {
          created_at: string
          id: string
          question: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          question: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          question?: string
          status?: string
        }
        Relationships: []
      }
      workspace_agents: {
        Row: {
          accent: string
          accuracy: number
          created_at: string
          current_activity: string
          emoji: string
          id: string
          last_seen: string
          model: string
          name: string
          objective: string
          permissions: Json
          provider: string
          role: string
          sandbox_mode: string
          skills: Json
          source: string
          specialties: Json
          status: string
          subtitle: string
          system_prompt: string
          tasks_completed: number
          tools: Json
          type: string
          updated_at: string
          workspace_id: string
          workspace_path: string
        }
        Insert: {
          accent?: string
          accuracy?: number
          created_at?: string
          current_activity?: string
          emoji?: string
          id: string
          last_seen?: string
          model: string
          name: string
          objective?: string
          permissions?: Json
          provider: string
          role: string
          sandbox_mode?: string
          skills?: Json
          source?: string
          specialties?: Json
          status?: string
          subtitle?: string
          system_prompt?: string
          tasks_completed?: number
          tools?: Json
          type?: string
          updated_at?: string
          workspace_id?: string
          workspace_path?: string
        }
        Update: {
          accent?: string
          accuracy?: number
          created_at?: string
          current_activity?: string
          emoji?: string
          id?: string
          last_seen?: string
          model?: string
          name?: string
          objective?: string
          permissions?: Json
          provider?: string
          role?: string
          sandbox_mode?: string
          skills?: Json
          source?: string
          specialties?: Json
          status?: string
          subtitle?: string
          system_prompt?: string
          tasks_completed?: number
          tools?: Json
          type?: string
          updated_at?: string
          workspace_id?: string
          workspace_path?: string
        }
        Relationships: []
      }
      workspace_command_runs: {
        Row: {
          agent_id: string
          command: string
          created_at: string
          cwd: string
          duration_ms: number | null
          exit_code: number | null
          id: string
          status: string
          stderr: string
          stdout: string
          timed_out: boolean
          workspace_id: string
          retry_count: number
          max_retries: number
          parent_run_id: string | null
          retry_of_run_id: string | null
          model: string | null
          provider: string | null
          token_usage: Json
          tool_calls: Json
          artifacts: Json
          phase: string
          queued_at: string | null
          planned_at: string | null
        }
        Insert: {
          agent_id: string
          command: string
          created_at?: string
          cwd?: string
          duration_ms?: number | null
          exit_code?: number | null
          id: string
          status?: string
          stderr?: string
          stdout?: string
          timed_out?: boolean
          workspace_id?: string
          retry_count?: number
          max_retries?: number
          parent_run_id?: string | null
          retry_of_run_id?: string | null
          model?: string | null
          provider?: string | null
          token_usage?: Json
          tool_calls?: Json
          artifacts?: Json
          phase?: string
          queued_at?: string | null
          planned_at?: string | null
        }
        Update: {
          agent_id?: string
          command?: string
          created_at?: string
          cwd?: string
          duration_ms?: number | null
          exit_code?: number | null
          id?: string
          status?: string
          stderr?: string
          stdout?: string
          timed_out?: boolean
          workspace_id?: string
          retry_count?: number
          max_retries?: number
          parent_run_id?: string | null
          retry_of_run_id?: string | null
          model?: string | null
          provider?: string | null
          token_usage?: Json
          tool_calls?: Json
          artifacts?: Json
          phase?: string
          queued_at?: string | null
          planned_at?: string | null
        }
        Relationships: []
      }
      workspace_delegations: {
        Row: {
          assignee_id: string
          created_at: string
          cwd: string
          execution_mode: string
          from_agent_id: string
          id: string
          notes: string
          payload: string
          priority: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assignee_id: string
          created_at?: string
          cwd?: string
          execution_mode?: string
          from_agent_id: string
          id: string
          notes?: string
          payload?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          assignee_id?: string
          created_at?: string
          cwd?: string
          execution_mode?: string
          from_agent_id?: string
          id?: string
          notes?: string
          payload?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_messages: {
        Row: {
          agent_id: string
          content: string
          created_at: string
          id: string
          message_timestamp: string
          role: string
          sender: string
          workspace_id: string
        }
        Insert: {
          agent_id: string
          content: string
          created_at?: string
          id: string
          message_timestamp: string
          role: string
          sender: string
          workspace_id?: string
        }
        Update: {
          agent_id?: string
          content?: string
          created_at?: string
          id?: string
          message_timestamp?: string
          role?: string
          sender?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_dispatcher_decisions: {
        Row: {
          complexity_score: number
          created_at: string
          id: string
          intent: string
          lane: string
          lead_agent_id: string
          payload: Json
          requires_plan_review: boolean
          risk_level: string
          workspace_id: string
        }
        Insert: {
          complexity_score?: number
          created_at?: string
          id: string
          intent?: string
          lane?: string
          lead_agent_id: string
          payload?: Json
          requires_plan_review?: boolean
          risk_level?: string
          workspace_id?: string
        }
        Update: {
          complexity_score?: number
          created_at?: string
          id?: string
          intent?: string
          lane?: string
          lead_agent_id?: string
          payload?: Json
          requires_plan_review?: boolean
          risk_level?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_context_packages: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          payload: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id: string
          payload?: Json
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          payload?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_task_trees: {
        Row: {
          created_at: string
          dispatcher_decision_id: string
          id: string
          payload: Json
          root_agent_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          dispatcher_decision_id: string
          id: string
          payload?: Json
          root_agent_id: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          dispatcher_decision_id?: string
          id?: string
          payload?: Json
          root_agent_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_verifier_reviews: {
        Row: {
          agent_id: string
          attempts: number
          created_at: string
          id: string
          payload: Json
          task_tree_id: string | null
          verdict: string
          workspace_id: string
        }
        Insert: {
          agent_id: string
          attempts?: number
          created_at?: string
          id: string
          payload?: Json
          task_tree_id?: string | null
          verdict?: string
          workspace_id?: string
        }
        Update: {
          agent_id?: string
          attempts?: number
          created_at?: string
          id?: string
          payload?: Json
          task_tree_id?: string | null
          verdict?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_plan_reviews: {
        Row: {
          created_at: string
          dispatcher_decision_id: string
          id: string
          payload: Json
          risk_level: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          dispatcher_decision_id: string
          id: string
          payload?: Json
          risk_level?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          dispatcher_decision_id?: string
          id?: string
          payload?: Json
          risk_level?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_circuit_breaker_events: {
        Row: {
          agent_id: string
          id: string
          payload: Json
          resolution: string
          triggered_at: string
          workspace_id: string
        }
        Insert: {
          agent_id: string
          id: string
          payload?: Json
          resolution?: string
          triggered_at?: string
          workspace_id?: string
        }
        Update: {
          agent_id?: string
          id?: string
          payload?: Json
          resolution?: string
          triggered_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_knowledge_graphs: {
        Row: {
          agent_id: string
          generated_at: string
          id: string
          payload: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agent_id: string
          generated_at?: string
          id: string
          payload?: Json
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          agent_id?: string
          generated_at?: string
          id?: string
          payload?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_tool_drafts: {
        Row: {
          created_at: string
          id: string
          language: string
          payload: Json
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id: string
          language?: string
          payload?: Json
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string
          payload?: Json
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_tool_invocations: {
        Row: {
          id: string
          workspace_id: string
          agent_id: string
          tool: string
          parameters: Json
          status: string
          risk_level: string
          requires_approval: boolean
          approval_request_id: string | null
          result: Json
          duration_ms: number | null
          error: string
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id: string
          workspace_id?: string
          agent_id: string
          tool: string
          parameters?: Json
          status?: string
          risk_level?: string
          requires_approval?: boolean
          approval_request_id?: string | null
          result?: Json
          duration_ms?: number | null
          error?: string
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          agent_id?: string
          tool?: string
          parameters?: Json
          status?: string
          risk_level?: string
          requires_approval?: boolean
          approval_request_id?: string | null
          result?: Json
          duration_ms?: number | null
          error?: string
          created_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      workspace_tool_approvals: {
        Row: {
          id: string
          workspace_id: string
          agent_id: string
          tool: string
          parameters: Json
          risk_level: string
          reasons: Json
          preview: Json
          status: string
          resolved_by: string | null
          resolved_at: string | null
          expires_at: string
          created_at: string
        }
        Insert: {
          id: string
          workspace_id?: string
          agent_id: string
          tool: string
          parameters?: Json
          risk_level?: string
          reasons?: Json
          preview?: Json
          status?: string
          resolved_by?: string | null
          resolved_at?: string | null
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          agent_id?: string
          tool?: string
          parameters?: Json
          risk_level?: string
          reasons?: Json
          preview?: Json
          status?: string
          resolved_by?: string | null
          resolved_at?: string | null
          expires_at?: string
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_next_agent_command: {
        Args: { p_agent_id: string }
        Returns: {
          agent_id: string
          command: string
          created_at: string
          created_by: string | null
          id: string
          payload: Json
          result: Json
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_commands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
