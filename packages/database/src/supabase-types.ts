export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      assessment_versions: {
        Row: {
          approval_evidence_id: string | null;
          approved_at: string | null;
          approved_by: string | null;
          assessment_id: string;
          created_at: string;
          created_by: string;
          id: string;
          reason: string | null;
          snapshot: Json;
          status: string;
          version_no: number;
        };
        Insert: {
          approval_evidence_id?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          assessment_id: string;
          created_at?: string;
          created_by: string;
          id: string;
          reason?: string | null;
          snapshot: Json;
          status: string;
          version_no: number;
        };
        Update: {
          approval_evidence_id?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          assessment_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          reason?: string | null;
          snapshot?: Json;
          status?: string;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_versions_assessment_id_fkey";
            columns: ["assessment_id"];
            isOneToOne: false;
            referencedRelation: "assessments";
            referencedColumns: ["id"];
          }
        ];
      };
      assessments: {
        Row: {
          created_at: string;
          created_by: string;
          current_version_no: number;
          financial_year_id: string;
          id: string;
          status: string;
          taxpayer_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          current_version_no?: number;
          financial_year_id: string;
          id: string;
          status: string;
          taxpayer_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          current_version_no?: number;
          financial_year_id?: string;
          id?: string;
          status?: string;
          taxpayer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessments_taxpayer_id_fkey";
            columns: ["taxpayer_id"];
            isOneToOne: false;
            referencedRelation: "taxpayers";
            referencedColumns: ["id"];
          }
        ];
      };
      audit_events: {
        Row: {
          actor_id: string;
          actor_role: string;
          aggregate_id: string | null;
          aggregate_type: string | null;
          causation_id: string | null;
          correlation_id: string;
          event_type: string;
          id: string;
          jurisdiction_id: string | null;
          occurred_at: string;
          payload: Json;
        };
        Insert: {
          actor_id: string;
          actor_role: string;
          aggregate_id?: string | null;
          aggregate_type?: string | null;
          causation_id?: string | null;
          correlation_id: string;
          event_type: string;
          id: string;
          jurisdiction_id?: string | null;
          occurred_at?: string;
          payload: Json;
        };
        Update: {
          actor_id?: string;
          actor_role?: string;
          aggregate_id?: string | null;
          aggregate_type?: string | null;
          causation_id?: string | null;
          correlation_id?: string;
          event_type?: string;
          id?: string;
          jurisdiction_id?: string | null;
          occurred_at?: string;
          payload?: Json;
        };
        Relationships: [];
      };
      demand_ledger: {
        Row: {
          amount: number;
          correlation_id: string;
          demand_unit_id: string;
          entry_type: string;
          financial_year_id: string;
          id: string;
          idempotency_key: string;
          metadata: Json;
          posted_at: string;
          posted_by: string;
          reverses_entry_id: string | null;
          source_id: string;
          source_type: string;
        };
        Insert: {
          amount: number;
          correlation_id: string;
          demand_unit_id: string;
          entry_type: string;
          financial_year_id: string;
          id: string;
          idempotency_key: string;
          metadata?: Json;
          posted_at?: string;
          posted_by: string;
          reverses_entry_id?: string | null;
          source_id: string;
          source_type: string;
        };
        Update: {
          amount?: number;
          correlation_id?: string;
          demand_unit_id?: string;
          entry_type?: string;
          financial_year_id?: string;
          id?: string;
          idempotency_key?: string;
          metadata?: Json;
          posted_at?: string;
          posted_by?: string;
          reverses_entry_id?: string | null;
          source_id?: string;
          source_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "demand_ledger_demand_unit_id_fkey";
            columns: ["demand_unit_id"];
            isOneToOne: false;
            referencedRelation: "demand_units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "demand_ledger_reverses_entry_id_fkey";
            columns: ["reverses_entry_id"];
            isOneToOne: false;
            referencedRelation: "demand_ledger";
            referencedColumns: ["id"];
          }
        ];
      };
      demand_units: {
        Row: {
          created_at: string;
          id: string;
          permanent_demand_no: string;
          taxpayer_id: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          permanent_demand_no: string;
          taxpayer_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          permanent_demand_no?: string;
          taxpayer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "demand_units_taxpayer_id_fkey";
            columns: ["taxpayer_id"];
            isOneToOne: false;
            referencedRelation: "taxpayers";
            referencedColumns: ["id"];
          }
        ];
      };
      jurisdictions: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          name: string;
          parent_id: string | null;
          tier: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          id: string;
          name: string;
          parent_id?: string | null;
          tier: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          name?: string;
          parent_id?: string | null;
          tier?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jurisdictions_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "jurisdictions";
            referencedColumns: ["id"];
          }
        ];
      };
      payment_receipts: {
        Row: {
          created_at: string;
          demand_unit_id: string;
          deposit_date: string;
          deposited_amount: number;
          id: string;
          ledger_entry_id: string | null;
          payment_channel: string;
          posted_by: string;
          receipt_number: string;
          receipt_scan_sha256: string | null;
          receipt_scan_url: string | null;
        };
        Insert: {
          created_at?: string;
          demand_unit_id: string;
          deposit_date: string;
          deposited_amount: number;
          id?: string;
          ledger_entry_id?: string | null;
          payment_channel: string;
          posted_by: string;
          receipt_number: string;
          receipt_scan_sha256?: string | null;
          receipt_scan_url?: string | null;
        };
        Update: {
          created_at?: string;
          demand_unit_id?: string;
          deposit_date?: string;
          deposited_amount?: number;
          id?: string;
          ledger_entry_id?: string | null;
          payment_channel?: string;
          posted_by?: string;
          receipt_number?: string;
          receipt_scan_sha256?: string | null;
          receipt_scan_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payment_receipts_demand_unit_id_fkey";
            columns: ["demand_unit_id"];
            isOneToOne: false;
            referencedRelation: "demand_units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_receipts_ledger_entry_id_fkey";
            columns: ["ledger_entry_id"];
            isOneToOne: false;
            referencedRelation: "demand_ledger";
            referencedColumns: ["id"];
          }
        ];
      };
      taxpayer_identifiers: {
        Row: {
          id: string;
          identifier_type: string;
          is_primary: boolean;
          masked_value: string;
          normalized_value: string;
          taxpayer_id: string;
          valid_from: string;
          valid_to: string | null;
        };
        Insert: {
          id?: string;
          identifier_type: string;
          is_primary?: boolean;
          masked_value: string;
          normalized_value: string;
          taxpayer_id: string;
          valid_from?: string;
          valid_to?: string | null;
        };
        Update: {
          id?: string;
          identifier_type?: string;
          is_primary?: boolean;
          masked_value?: string;
          normalized_value?: string;
          taxpayer_id?: string;
          valid_from?: string;
          valid_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "taxpayer_identifiers_taxpayer_id_fkey";
            columns: ["taxpayer_id"];
            isOneToOne: false;
            referencedRelation: "taxpayers";
            referencedColumns: ["id"];
          }
        ];
      };
      taxpayers: {
        Row: {
          created_at: string;
          created_by: string;
          current_circle_id: string;
          display_name: string;
          id: string;
          permanent_demand_no: string | null;
          row_version: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          current_circle_id: string;
          display_name: string;
          id: string;
          permanent_demand_no?: string | null;
          row_version?: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          current_circle_id?: string;
          display_name?: string;
          id?: string;
          permanent_demand_no?: string | null;
          row_version?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "taxpayers_current_circle_id_fkey";
            columns: ["current_circle_id"];
            isOneToOne: false;
            referencedRelation: "jurisdictions";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {}
  }
} as const;
