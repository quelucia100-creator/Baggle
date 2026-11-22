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
      account_preferences: {
        Row: {
          accessibility: string[] | null
          alcohol: string | null
          completed: boolean
          date_of_birth: string | null
          dietary: string[] | null
          food_allergies: string[] | null
          food_preferences: string[] | null
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
          status: string
          venue_source: string | null
        }
        Insert: {
          area_label?: string
          area_lat?: number
          area_lng?: number
          category?: string
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
          status?: string
          venue_source?: string | null
        }
        Update: {
          area_label?: string
          area_lat?: number
          area_lng?: number
          category?: string
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
      party_plan_snapshot: {
        Args: { p_code: string; p_lease: string }
        Returns: Json
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
