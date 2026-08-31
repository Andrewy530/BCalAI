export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ai_schedule_requests: {
        Row: {
          completed_at: string | null
          constraints: Json
          created_at: string
          error_code: string | null
          id: string
          status: Database["public"]["Enums"]["ai_request_status"]
          task_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          constraints?: Json
          created_at?: string
          error_code?: string | null
          id?: string
          status?: Database["public"]["Enums"]["ai_request_status"]
          task_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          constraints?: Json
          created_at?: string
          error_code?: string | null
          id?: string
          status?: Database["public"]["Enums"]["ai_request_status"]
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_schedule_requests_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_schedule_suggestions: {
        Row: {
          accepted_at: string | null
          end_at: string
          id: string
          rank: number
          reason: string
          request_id: string
          score: number
          start_at: string
        }
        Insert: {
          accepted_at?: string | null
          end_at: string
          id?: string
          rank: number
          reason: string
          request_id: string
          score: number
          start_at: string
        }
        Update: {
          accepted_at?: string | null
          end_at?: string
          id?: string
          rank?: number
          reason?: string
          request_id?: string
          score?: number
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_schedule_suggestions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "ai_schedule_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_sync_states: {
        Row: {
          calendar_id: string | null
          id: string
          last_error: string | null
          last_full_sync_at: string | null
          last_incremental_sync_at: string | null
          needs_full_resync: boolean
          provider_account_id: string
          provider_calendar_id: string
          retry_count: number
          sync_cursor: string | null
          updated_at: string
          webhook_channel_id: string | null
          webhook_expires_at: string | null
          webhook_resource_id: string | null
          webhook_subscription_id: string | null
          webhook_token: string | null
        }
        Insert: {
          calendar_id?: string | null
          id?: string
          last_error?: string | null
          last_full_sync_at?: string | null
          last_incremental_sync_at?: string | null
          needs_full_resync?: boolean
          provider_account_id: string
          provider_calendar_id: string
          retry_count?: number
          sync_cursor?: string | null
          updated_at?: string
          webhook_channel_id?: string | null
          webhook_expires_at?: string | null
          webhook_resource_id?: string | null
          webhook_subscription_id?: string | null
          webhook_token?: string | null
        }
        Update: {
          calendar_id?: string | null
          id?: string
          last_error?: string | null
          last_full_sync_at?: string | null
          last_incremental_sync_at?: string | null
          needs_full_resync?: boolean
          provider_account_id?: string
          provider_calendar_id?: string
          retry_count?: number
          sync_cursor?: string | null
          updated_at?: string
          webhook_channel_id?: string | null
          webhook_expires_at?: string | null
          webhook_resource_id?: string | null
          webhook_subscription_id?: string | null
          webhook_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sync_states_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_sync_states_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "calendar_sync_health"
            referencedColumns: ["provider_account_id"]
          },
          {
            foreignKeyName: "calendar_sync_states_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_sync_states_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts_public"
            referencedColumns: ["id"]
          },
        ]
      }
      calendars: {
        Row: {
          color: string
          created_at: string
          id: string
          is_default: boolean
          is_read_only: boolean
          is_visible: boolean
          name: string
          provider_account_id: string | null
          provider_calendar_id: string | null
          source_type: Database["public"]["Enums"]["calendar_source"]
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_read_only?: boolean
          is_visible?: boolean
          name: string
          provider_account_id?: string | null
          provider_calendar_id?: string | null
          source_type?: Database["public"]["Enums"]["calendar_source"]
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_read_only?: boolean
          is_visible?: boolean
          name?: string
          provider_account_id?: string | null
          provider_calendar_id?: string | null
          source_type?: Database["public"]["Enums"]["calendar_source"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendars_provider_account_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "calendar_sync_health"
            referencedColumns: ["provider_account_id"]
          },
          {
            foreignKeyName: "calendars_provider_account_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendars_provider_account_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts_public"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          alerts: number[]
          all_day: boolean
          calendar_id: string
          created_at: string
          description: string | null
          end_at: string
          id: string
          location: string | null
          provider_account_id: string | null
          provider_etag: string | null
          provider_event_id: string | null
          provider_updated_at: string | null
          recurrence_rule: string | null
          source_type: Database["public"]["Enums"]["calendar_source"]
          start_at: string
          status: Database["public"]["Enums"]["event_status"]
          sync_status: Database["public"]["Enums"]["sync_status"]
          timezone: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alerts?: number[]
          all_day?: boolean
          calendar_id: string
          created_at?: string
          description?: string | null
          end_at: string
          id?: string
          location?: string | null
          provider_account_id?: string | null
          provider_etag?: string | null
          provider_event_id?: string | null
          provider_updated_at?: string | null
          recurrence_rule?: string | null
          source_type?: Database["public"]["Enums"]["calendar_source"]
          start_at: string
          status?: Database["public"]["Enums"]["event_status"]
          sync_status?: Database["public"]["Enums"]["sync_status"]
          timezone?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alerts?: number[]
          all_day?: boolean
          calendar_id?: string
          created_at?: string
          description?: string | null
          end_at?: string
          id?: string
          location?: string | null
          provider_account_id?: string | null
          provider_etag?: string | null
          provider_event_id?: string | null
          provider_updated_at?: string | null
          recurrence_rule?: string | null
          source_type?: Database["public"]["Enums"]["calendar_source"]
          start_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          sync_status?: Database["public"]["Enums"]["sync_status"]
          timezone?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_provider_account_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "calendar_sync_health"
            referencedColumns: ["provider_account_id"]
          },
          {
            foreignKeyName: "events_provider_account_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_provider_account_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts_public"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          code_verifier: string
          created_at: string
          expires_at: string
          id: string
          provider: Database["public"]["Enums"]["provider_kind"]
          redirect_uri: string
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          expires_at?: string
          id?: string
          provider: Database["public"]["Enums"]["provider_kind"]
          redirect_uri: string
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          expires_at?: string
          id?: string
          provider?: Database["public"]["Enums"]["provider_kind"]
          redirect_uri?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_event_minutes: number
          default_task_minutes: number
          full_name: string | null
          hour_cycle: string
          id: string
          timezone: string
          updated_at: string
          week_starts_on: number
          working_hours: Json
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_event_minutes?: number
          default_task_minutes?: number
          full_name?: string | null
          hour_cycle?: string
          id: string
          timezone?: string
          updated_at?: string
          week_starts_on?: number
          working_hours?: Json
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_event_minutes?: number
          default_task_minutes?: number
          full_name?: string | null
          hour_cycle?: string
          id?: string
          timezone?: string
          updated_at?: string
          week_starts_on?: number
          working_hours?: Json
        }
        Relationships: []
      }
      provider_accounts: {
        Row: {
          connected_at: string
          created_at: string
          email: string | null
          id: string
          last_error: string | null
          last_sync_at: string | null
          provider: Database["public"]["Enums"]["provider_kind"]
          provider_user_id: string
          scopes: string[]
          secret_reference_id: string | null
          status: Database["public"]["Enums"]["provider_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          created_at?: string
          email?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider: Database["public"]["Enums"]["provider_kind"]
          provider_user_id: string
          scopes?: string[]
          secret_reference_id?: string | null
          status?: Database["public"]["Enums"]["provider_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string
          created_at?: string
          email?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider?: Database["public"]["Enums"]["provider_kind"]
          provider_user_id?: string
          scopes?: string[]
          secret_reference_id?: string | null
          status?: Database["public"]["Enums"]["provider_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          entitlement: string
          expires_at: string | null
          id: string
          provider: string
          raw_customer_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          entitlement: string
          expires_at?: string | null
          id?: string
          provider?: string
          raw_customer_id?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          entitlement?: string
          expires_at?: string | null
          id?: string
          provider?: string
          raw_customer_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          attempts: number
          created_at: string
          id: string
          idempotency_key: string | null
          kind: string
          last_error: string | null
          payload: Json
          provider_account_id: string | null
          run_after: string
          status: Database["public"]["Enums"]["sync_job_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          kind: string
          last_error?: string | null
          payload?: Json
          provider_account_id?: string | null
          run_after?: string
          status?: Database["public"]["Enums"]["sync_job_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          kind?: string
          last_error?: string | null
          payload?: Json
          provider_account_id?: string | null
          run_after?: string
          status?: Database["public"]["Enums"]["sync_job_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_jobs_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "calendar_sync_health"
            referencedColumns: ["provider_account_id"]
          },
          {
            foreignKeyName: "sync_jobs_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_jobs_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts_public"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      task_lists: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      task_tags: {
        Row: {
          tag_id: string
          task_id: string
        }
        Insert: {
          tag_id: string
          task_id: string
        }
        Update: {
          tag_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_tags_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_at: string | null
          estimated_minutes: number | null
          has_due_time: boolean
          id: string
          is_flexible: boolean
          list_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          recurrence_rule: string | null
          scheduled_event_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          has_due_time?: boolean
          id?: string
          is_flexible?: boolean
          list_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence_rule?: string | null
          scheduled_event_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          has_due_time?: boolean
          id?: string
          is_flexible?: boolean
          list_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence_rule?: string | null
          scheduled_event_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "task_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_scheduled_event_id_fkey"
            columns: ["scheduled_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      calendar_sync_health: {
        Row: {
          account_status: Database["public"]["Enums"]["provider_status"] | null
          calendar_id: string | null
          has_error: boolean | null
          last_full_sync_at: string | null
          last_incremental_sync_at: string | null
          needs_full_resync: boolean | null
          provider: Database["public"]["Enums"]["provider_kind"] | null
          provider_account_id: string | null
          retry_count: number | null
          user_id: string | null
          webhook_expires_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sync_states_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_accounts_public: {
        Row: {
          connected_at: string | null
          email: string | null
          id: string | null
          last_sync_at: string | null
          provider: Database["public"]["Enums"]["provider_kind"] | null
          scopes: string[] | null
          status: Database["public"]["Enums"]["provider_status"] | null
          user_id: string | null
        }
        Insert: {
          connected_at?: string | null
          email?: string | null
          id?: string | null
          last_sync_at?: string | null
          provider?: Database["public"]["Enums"]["provider_kind"] | null
          scopes?: string[] | null
          status?: Database["public"]["Enums"]["provider_status"] | null
          user_id?: string | null
        }
        Update: {
          connected_at?: string | null
          email?: string | null
          id?: string | null
          last_sync_at?: string | null
          provider?: Database["public"]["Enums"]["provider_kind"] | null
          scopes?: string[] | null
          status?: Database["public"]["Enums"]["provider_status"] | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_sync_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          id: string
          idempotency_key: string | null
          kind: string
          last_error: string | null
          payload: Json
          provider_account_id: string | null
          run_after: string
          status: Database["public"]["Enums"]["sync_job_status"]
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "sync_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_sync_job: {
        Args: {
          p_error?: string
          p_job_id: string
          p_max_attempts?: number
          p_succeeded: boolean
        }
        Returns: undefined
      }
      delete_provider_secret: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      enqueue_sync_job: {
        Args: {
          p_idempotency_key?: string
          p_kind: string
          p_payload?: Json
          p_provider_account_id: string
          p_run_after?: string
          p_user_id: string
        }
        Returns: string
      }
      has_active_entitlement: {
        Args: { p_entitlement?: string; p_user_id: string }
        Returns: boolean
      }
      prune_sync_history: { Args: { p_older_than?: string }; Returns: number }
      read_provider_secret: { Args: { p_account_id: string }; Returns: string }
      store_provider_secret: {
        Args: { p_account_id: string; p_secret: string }
        Returns: string
      }
    }
    Enums: {
      ai_request_status:
        | "pending"
        | "proposed"
        | "accepted"
        | "rejected"
        | "failed"
      calendar_source: "internal" | "google" | "microsoft" | "device"
      event_status: "confirmed" | "tentative" | "cancelled"
      provider_kind: "google" | "microsoft"
      provider_status: "active" | "expired" | "revoked" | "error"
      sync_job_status: "queued" | "running" | "succeeded" | "failed" | "dead"
      sync_status: "synced" | "pending" | "failed" | "conflict"
      task_priority: "low" | "normal" | "high" | "urgent"
      task_status: "open" | "scheduled" | "completed" | "archived"
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
    Enums: {
      ai_request_status: [
        "pending",
        "proposed",
        "accepted",
        "rejected",
        "failed",
      ],
      calendar_source: ["internal", "google", "microsoft", "device"],
      event_status: ["confirmed", "tentative", "cancelled"],
      provider_kind: ["google", "microsoft"],
      provider_status: ["active", "expired", "revoked", "error"],
      sync_job_status: ["queued", "running", "succeeded", "failed", "dead"],
      sync_status: ["synced", "pending", "failed", "conflict"],
      task_priority: ["low", "normal", "high", "urgent"],
      task_status: ["open", "scheduled", "completed", "archived"],
    },
  },
} as const
