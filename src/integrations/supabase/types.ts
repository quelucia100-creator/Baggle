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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      account_availability: {
        Row: {
          available_date: string
          busy_slots: number[]
          confirmed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          available_date: string
          busy_slots?: number[]
          confirmed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          available_date?: string
          busy_slots?: number[]
          confirmed?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_preferences: {
        Row: {
          accessibility: string[] | null
          alcohol: string | null
          completed: boolean
          date_of_birth: string | null
          dietary: string[] | null
          food_allergies: string[] | null
          food_preferences: string[] | null
          is_private: boolean
          tastes: string[] | null
          user_id: string
          username: string | null
        }
        Insert: {
          accessibility?: string[] | null
          alcohol?: string | null
          completed?: boolean
          date_of_birth?: string | null
          dietary?: string[] | null
          food_allergies?: string[] | null
          food_preferences?: string[] | null
          is_private?: boolean
          tastes?: string[] | null
          user_id: string
          username?: string | null
        }
        Update: {
          accessibility?: string[] | null
          alcohol?: string | null
          completed?: boolean
          date_of_birth?: string | null
          dietary?: string[] | null
          food_allergies?: string[] | null
          food_preferences?: string[] | null
          is_private?: boolean
          tastes?: string[] | null
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_group_members: {
        Row: {
          added_at: string
          group_id: string
          status: string
          user_id: string
        }
        Insert: {
          added_at?: string
          group_id: string
          status?: string
          user_id: string
        }
        Update: {
          added_at?: string
          group_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "friend_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_username: string | null
          created_at: string
          detail: string | null
          id: string
          kind: string
          read: boolean
          user_id: string
        }
        Insert: {
          actor_username?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind: string
          read?: boolean
          user_id: string
        }
        Update: {
          actor_username?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
          read?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          code: string
          created_at: string
          event_state: Json | null
          hangout: Json | null
          id: string
          journey_started: boolean
          weather_cache: Json | null
          weather_cached_at: string | null
          weather_key: string | null
        }
        Insert: {
          code: string
          created_at?: string
          event_state?: Json | null
          hangout?: Json | null
          id?: string
          journey_started?: boolean
          weather_cache?: Json | null
          weather_cached_at?: string | null
          weather_key?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          event_state?: Json | null
          hangout?: Json | null
          id?: string
          journey_started?: boolean
          weather_cache?: Json | null
          weather_cached_at?: string | null
          weather_key?: string | null
        }
        Relationships: []
      }
      party_members: {
        Row: {
          display_name: string
          event_round: string | null
          event_vote: string | null
          id: string
          is_host: boolean
          joined_at: string
          latitude: number | null
          location_updated_at: string | null
          longitude: number | null
          party_id: string
          removed: boolean
          status_view: boolean
          token_hash: string
        }
        Insert: {
          display_name: string
          event_round?: string | null
          event_vote?: string | null
          id?: string
          is_host?: boolean
          joined_at?: string
          latitude?: number | null
          location_updated_at?: string | null
          longitude?: number | null
          party_id: string
          removed?: boolean
          status_view?: boolean
          token_hash: string
        }
        Update: {
          display_name?: string
          event_round?: string | null
          event_vote?: string | null
          id?: string
          is_host?: boolean
          joined_at?: string
          latitude?: number | null
          location_updated_at?: string | null
          longitude?: number | null
          party_id?: string
          removed?: boolean
          status_view?: boolean
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_members_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      party_planning: {
        Row: {
          area_label: string
          area_lat: number
          area_lng: number
          category: string
          config_v3: Json | null
          duration_min: number
          event_date: string
          group_rerolls_used: number
          lock_id: string | null
          lock_snapshot: Json | null
          lock_started_at: string | null
          options: Json
          outliers: string[]
          participants: string[]
          party_id: string
          plan_index: number
          revision: number
          schema_version: number
          status: string
          venue_source: string | null
        }
        Insert: {
          area_label?: string
          area_lat?: number
          area_lng?: number
          category?: string
          config_v3?: Json | null
          duration_min?: number
          event_date?: string
          group_rerolls_used?: number
          lock_id?: string | null
          lock_snapshot?: Json | null
          lock_started_at?: string | null
          options?: Json
          outliers?: string[]
          participants?: string[]
          party_id: string
          plan_index?: number
          revision?: number
          schema_version?: number
          status?: string
          venue_source?: string | null
        }
        Update: {
          area_label?: string
          area_lat?: number
          area_lng?: number
          category?: string
          config_v3?: Json | null
          duration_min?: number
          event_date?: string
          group_rerolls_used?: number
          lock_id?: string | null
          lock_snapshot?: Json | null
          lock_started_at?: string | null
          options?: Json
          outliers?: string[]
          participants?: string[]
          party_id?: string
          plan_index?: number
          revision?: number
          schema_version?: number
          status?: string
          venue_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "party_planning_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: true
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      party_preferences: {
        Row: {
          budget: number
          free_from: string
          free_to: string
          max_travel_min: number
          member_id: string
          origin_lat: number | null
          origin_lng: number | null
          submitted_at: string
        }
        Insert: {
          budget: number
          free_from: string
          free_to: string
          max_travel_min: number
          member_id: string
          origin_lat?: number | null
          origin_lng?: number | null
          submitted_at?: string
        }
        Update: {
          budget?: number
          free_from?: string
          free_to?: string
          max_travel_min?: number
          member_id?: string
          origin_lat?: number | null
          origin_lng?: number | null
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_preferences_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "party_members"
            referencedColumns: ["id"]
          },
        ]
      }
      party_preferences_v3: {
        Row: {
          member_id: string
          party_id: string
          precise_expires_at: string | null
          preferences: Json
          submitted: boolean
          updated_at: string
        }
        Insert: {
          member_id: string
          party_id: string
          precise_expires_at?: string | null
          preferences: Json
          submitted?: boolean
          updated_at?: string
        }
        Update: {
          member_id?: string
          party_id?: string
          precise_expires_at?: string | null
          preferences?: Json
          submitted?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_preferences_v3_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "party_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_preferences_v3_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      party_reroll_votes: {
        Row: {
          member_id: string
          party_id: string
          revision: number
        }
        Insert: {
          member_id: string
          party_id: string
          revision: number
        }
        Update: {
          member_id?: string
          party_id?: string
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "party_reroll_votes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "party_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_reroll_votes_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      friend_action: {
        Args: { p_action: string; p_id?: string; p_username?: string }
        Returns: Json
      }
      group_action: {
        Args: {
          p_action: string
          p_group?: string
          p_name?: string
          p_username?: string
        }
        Returns: Json
      }
      invite_group_to_journey: {
        Args: { p_code: string; p_group: string }
        Returns: Json
      }
      party_access: {
        Args: {
          p_action: string
          p_code: string
          p_member?: string
          p_name?: string
          p_token: string
        }
        Returns: Json
      }
      party_event: {
        Args: {
          p_action: string
          p_code: string
          p_lat?: number
          p_lng?: number
          p_member?: string
          p_name?: string
          p_round?: string
          p_token: string
        }
        Returns: Json
      }
      party_journey: {
        Args: {
          p_action: string
          p_code: string
          p_lat?: number
          p_lng?: number
          p_member?: string
          p_name?: string
          p_token: string
        }
        Returns: Json
      }
      party_plan: {
        Args: {
          p_action: string
          p_code: string
          p_payload?: Json
          p_token: string
        }
        Returns: Json
      }
      party_plan_cleanup: { Args: never; Returns: number }
      party_plan_complete: {
        Args: {
          p_code: string
          p_failed?: boolean
          p_lease: string
          p_options?: Json
          p_outliers?: string[]
          p_source?: string
        }
        Returns: boolean
      }
      party_plan_public_option: { Args: { o: Json }; Returns: Json }
      party_plan_public_option_v3: { Args: { c: Json; o: Json }; Returns: Json }
      party_plan_snapshot: {
        Args: { p_code: string; p_lease: string }
        Returns: Json
      }
      party_v3_bool: { Args: { v: Json }; Returns: boolean }
      party_v3_config: { Args: { p: Json }; Returns: Json }
      party_v3_date: { Args: { v: Json }; Returns: string }
      party_v3_enum: { Args: { allowed: string[]; v: Json }; Returns: string }
      party_v3_enum_set: {
        Args: { allowed: string[]; maxn: number; minn: number; v: Json }
        Returns: Json
      }
      party_v3_expire: { Args: { p_party: string }; Returns: undefined }
      party_v3_https: { Args: { v: Json }; Returns: string }
      party_v3_int: {
        Args: { hi: number; lo: number; step: number; v: Json }
        Returns: number
      }
      party_v3_iso: { Args: { t: string }; Returns: string }
      party_v3_keys: { Args: { k: string[]; o: Json }; Returns: boolean }
      party_v3_num: {
        Args: { hi: number; lo: number; v: Json }
        Returns: number
      }
      party_v3_point: { Args: { v: Json }; Returns: Json }
      party_v3_prefs: {
        Args: { c: Json; p: Json; p_strict: boolean }
        Returns: Json
      }
      party_v3_self_doc: { Args: { c: Json; p: Json }; Returns: Json }
      party_v3_str: { Args: { maxlen: number; v: Json }; Returns: string }
      party_v3_tags: { Args: { maxn: number; v: Json }; Returns: Json }
      party_v3_ts: { Args: { v: Json }; Returns: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
