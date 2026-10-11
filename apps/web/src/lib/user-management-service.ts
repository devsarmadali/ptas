/**
 * PTAS User Management & Jurisdiction Administration Service
 * Pure live Supabase database & statutory RPC integration.
 * No mock/pilot data.
 */

import { getSupabaseAuthClient } from "./supabase-auth";

export interface LiveOfficerAccount {
  readonly user_id: string;
  readonly auth_user_id: string | null;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly cnic: string;
  readonly designation: string;
  readonly office_address: string;
  readonly active: boolean;
  readonly created_at: string;
  readonly role: "ETO" | "INSPECTOR" | "DIRECTOR" | "ADMIN";
  readonly jurisdiction_id: string;
  readonly circle_name: string;
  readonly circle_code: string;
  readonly tehsil_id: string | null;
  readonly tehsil_name: string | null;
  readonly district_id: string;
  readonly district_name: string;
  readonly assigned_survey_units_count: number;
  readonly circle_survey_units_count: number;
}

export interface GovernanceCircleRecord {
  readonly circle_id: string;
  readonly circle_code: string;
  readonly circle_name: string;
  readonly circle_address: string;
  readonly tehsil_id: string;
  readonly tehsil_name: string;
  readonly tehsil_code: string;
  readonly district_id: string;
  readonly district_name: string;
  readonly district_code: string;
  readonly inspector_id: string | null;
  readonly inspector_name: string | null;
  readonly inspector_phone: string | null;
  readonly inspector_email: string | null;
  readonly units_count: number;
  readonly approved_units_count: number;
  readonly total_assessed_demand: number;
}

export interface LiveAuditRecord {
  readonly id: string;
  readonly event_type: string;
  readonly aggregate_type: string;
  readonly aggregate_id: string;
  readonly actor_id: string;
  readonly actor_role: string;
  readonly performed_by_name: string;
  readonly jurisdiction_id: string | null;
  readonly occurred_at: string;
  readonly reason: string | null;
  readonly from_status: string | null;
  readonly to_status: string | null;
  readonly payload: Record<string, unknown>;
}

export async function fetchOfficersDirectory(): Promise<LiveOfficerAccount[]> {
  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.rpc("get_officers_directory");
  if (error) {
    throw new Error(`Failed to load officers directory: ${error.message}`);
  }
  if (!Array.isArray(data)) return [];
  return data as unknown as LiveOfficerAccount[];
}

export async function fetchDistrictGovernanceMatrix(): Promise<GovernanceCircleRecord[]> {
  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.rpc("get_district_governance_matrix");
  if (error) {
    throw new Error(`Failed to load governance matrix: ${error.message}`);
  }
  if (!Array.isArray(data)) return [];
  return data as unknown as GovernanceCircleRecord[];
}

export async function fetchUserManagementAuditLog(limit = 100): Promise<LiveAuditRecord[]> {
  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.rpc("get_user_management_audit_log", { p_limit: limit });
  if (error) {
    throw new Error(`Failed to load user management audit logs: ${error.message}`);
  }
  if (!Array.isArray(data)) return [];
  return data as unknown as LiveAuditRecord[];
}

export async function updateOfficerProfile(params: {
  userId: string;
  displayName: string;
  phone: string;
  cnic: string;
  designation: string;
  officeAddress: string;
}): Promise<void> {
  const supabase = getSupabaseAuthClient();
  const { error } = await supabase.rpc("update_officer_profile", {
    p_user_id: params.userId,
    p_display_name: params.displayName,
    p_phone: params.phone,
    p_cnic: params.cnic,
    p_designation: params.designation,
    p_office_address: params.officeAddress
  });
  if (error) {
    throw new Error(`Failed to update profile: ${error.message}`);
  }
}

export async function reassignOfficerCircle(params: {
  userId: string;
  newCircleId: string;
  reason: string;
}): Promise<void> {
  const supabase = getSupabaseAuthClient();
  const { error } = await supabase.rpc("reassign_officer_circle", {
    p_user_id: params.userId,
    p_new_circle_id: params.newCircleId,
    p_reason: params.reason
  });
  if (error) {
    throw new Error(`Failed to reassign circle: ${error.message}`);
  }
}

export async function attachCircleToTehsil(params: {
  circleId: string;
  tehsilId: string;
  reason: string;
}): Promise<void> {
  const supabase = getSupabaseAuthClient();
  const { error } = await supabase.rpc("attach_circle_to_tehsil", {
    p_circle_id: params.circleId,
    p_tehsil_id: params.tehsilId,
    p_reason: params.reason
  });
  if (error) {
    throw new Error(`Failed to attach circle to tehsil: ${error.message}`);
  }
}

export async function setOfficerStatus(params: {
  userId: string;
  active: boolean;
  reason: string;
}): Promise<void> {
  const supabase = getSupabaseAuthClient();
  const { error } = await supabase.rpc("set_officer_status", {
    p_user_id: params.userId,
    p_active: params.active,
    p_reason: params.reason
  });
  if (error) {
    throw new Error(`Failed to update officer status: ${error.message}`);
  }
}

export async function adminSetOfficerPassword(params: {
  targetUserId: string;
  newPassword: string;
}): Promise<void> {
  if (params.newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }
  const supabase = getSupabaseAuthClient();
  const { error } = await supabase.rpc("admin_set_officer_password", {
    p_target_user_id: params.targetUserId,
    p_new_password: params.newPassword
  });
  if (error) {
    throw new Error(`Failed to set officer password: ${error.message}`);
  }
}

export async function adminCreateOfficer(params: {
  name: string;
  email: string;
  role: "INSPECTOR" | "ETO";
  circleId: string;
  phone: string;
  cnic: string;
  designation: string;
  officeAddress: string;
  initialPassword: string;
}): Promise<{ id: string; name: string; email: string }> {
  if (params.initialPassword.length < 6) {
    throw new Error("Initial password must be at least 6 characters.");
  }
  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.rpc("admin_create_officer", {
    p_name: params.name,
    p_email: params.email,
    p_role: params.role,
    p_circle_id: params.circleId,
    p_phone: params.phone,
    p_cnic: params.cnic,
    p_designation: params.designation,
    p_office_address: params.officeAddress,
    p_initial_password: params.initialPassword
  });
  if (error) {
    throw new Error(`Failed to create officer: ${error.message}`);
  }
  return data as unknown as { id: string; name: string; email: string };
}
