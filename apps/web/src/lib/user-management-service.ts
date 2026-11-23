/**
 * PTAS User Management & Jurisdiction Administration Service
 * Pure live Supabase database & statutory RPC integration.
 * Governed by:
 * - AGENTS.md: Enforce role and jurisdiction on server/client for every read/write.
 * - Migration 0063: Permanent geographical codes, sanctioned posts (DET BS-19 / ETO BS-17 /
 *   ETI BS-14..16 / ETC BS-05 Notice Delivery Only), decoupled postings, & strict authority.
 */

import { CADRE_BPS_BOUNDS, normalizeCadreCode, type PostChargeType } from "@ptas/domain";
import { getSupabaseAuthClient } from "./supabase-auth";
import {
  PTAS_CACHE_KEYS,
  getOrFetchCached,
  invalidateQueryCache,
  invalidateQueryCachePrefix
} from "./query-cache";

export type CanonicalUserRole =
  "ADMIN" | "DET" | "DIRECTOR" | "ETO" | "ETI" | "INSPECTOR" | "ETC" | "FINANCE" | "AUDITOR";

export interface AdditionalAssignedPost {
  readonly post_id: string;
  readonly post_code: string;
  readonly post_title: string;
  readonly charge_type: PostChargeType;
  readonly circle_id: string | null;
  readonly circle_code: string | null;
  readonly circle_name: string | null;
}

export interface LiveOfficerAccount {
  readonly user_id: string;
  readonly auth_user_id: string | null;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly cnic: string;
  readonly designation: string;
  readonly office_address: string;
  readonly ppo_number?: string;
  readonly father_name?: string;
  readonly bps_scale?: number;
  readonly must_change_password?: boolean;
  readonly active: boolean;
  readonly created_at: string;
  readonly role: CanonicalUserRole;
  readonly cadre_code?: string;
  readonly posting_status?: "POSTED" | "UNPOSTED";
  readonly post_id?: string | null;
  readonly post_code?: string;
  readonly post_title?: string;
  readonly charge_type?: PostChargeType | null;
  readonly additional_posts?: readonly AdditionalAssignedPost[];
  readonly jurisdiction_id: string;
  readonly circle_name: string;
  readonly circle_code: string;
  readonly circle_id?: string | null;
  readonly tehsil_id: string | null;
  readonly tehsil_name: string | null;
  readonly district_id: string | null;
  readonly district_name: string;
  readonly district_code?: string;
  readonly pbs_code?: string;
  readonly division_name?: string;
  readonly is_primary?: boolean;
  readonly transfer_order_number?: string;
  readonly posting_date?: string | null;
  readonly assigned_survey_units_count: number;
  readonly circle_survey_units_count: number;
}

export interface GovernanceCircleRecord {
  readonly circle_id: string;
  readonly circle_code: string;
  readonly circle_name: string;
  readonly circle_address?: string;
  readonly tehsil_id: string | null;
  readonly tehsil_name: string;
  readonly tehsil_code?: string;
  readonly district_id: string;
  readonly district_name: string;
  readonly district_code: string;
  readonly inspector_id: string | null;
  readonly inspector_name: string | null;
  readonly inspector_phone: string | null;
  readonly inspector_email: string | null;
  readonly inspector_ppo?: string | null;
  readonly is_primary_charge?: boolean | null;
  readonly transfer_order_number?: string | null;
  readonly posting_date?: string | null;
  readonly units_count: number;
  readonly approved_units_count: number;
  readonly total_assessed_demand: number;
}

export interface GovernanceDivisionRecord {
  readonly id: string;
  readonly division_code: string;
  readonly name: string;
  readonly abbrev: string;
  readonly headquarter_city: string;
}

export interface GovernanceDistrictRecord {
  readonly id: string;
  readonly division_id: string;
  readonly pbs_code: string;
  readonly district_code: string;
  readonly name: string;
  readonly full_name: string;
}

export interface GovernanceTehsilRecord {
  readonly id: string;
  readonly district_id: string;
  readonly division_id: string;
  readonly tehsil_code: number;
  readonly name: string;
  readonly attached_circles_count: number;
}

export interface SanctionedPostRecord {
  readonly post_id: string;
  readonly post_code: string;
  readonly post_title: string;
  readonly role_code: "DET" | "ETO" | "ETI" | "ETC";
  readonly cadre_code: "DET" | "ETO" | "ETI" | "ETC";
  readonly jurisdiction_tier: "DIVISION" | "DISTRICT" | "CIRCLE";
  readonly division_id: string;
  readonly division_name: string;
  readonly division_abbrev: string;
  readonly district_id: string | null;
  readonly district_name: string | null;
  readonly district_code: string | null;
  readonly circle_id: string | null;
  readonly circle_code: string | null;
  readonly circle_name: string | null;
  readonly post_sequence: number;
  readonly min_bps: number;
  readonly max_bps: number;
  readonly is_permanent: boolean;
  readonly status: "ACTIVE" | "ABOLISHED";
  readonly sanctioned_order_no: string | null;
  readonly is_vacant: boolean;
  readonly assignment_id: string | null;
  readonly incumbent_user_id: string | null;
  readonly incumbent_name: string | null;
  readonly incumbent_email: string | null;
  readonly incumbent_phone: string | null;
  readonly incumbent_ppo: string | null;
  readonly incumbent_bps: number | null;
  readonly incumbent_cadre: string | null;
  readonly charge_type: PostChargeType | null;
  readonly transfer_order_number: string | null;
  readonly valid_from: string | null;
}

export interface GovernanceCircleWithPostsRecord {
  readonly circle_id: string;
  readonly circle_code: string;
  readonly circle_number: number;
  readonly circle_name: string;
  readonly office_address: string;
  readonly is_immutable: boolean;
  readonly tehsil_id: string | null;
  readonly tehsil_name: string | null;
  readonly tehsil_code: string | null;
  readonly district_id: string;
  readonly district_name: string;
  readonly district_code: string;
  readonly division_id: string;
  readonly division_name: string;
  readonly units_count: number;
  readonly approved_units_count: number;
  readonly total_assessed_demand: number;
  readonly posts: readonly SanctionedPostRecord[];
}

export interface JurisdictionGovernanceActorCapabilities {
  readonly user_id: string;
  readonly role_code: string;
  readonly cadre_code: string;
  readonly bps_scale: number | null;
  readonly jurisdiction_id: string;
  readonly jurisdiction_tier: string | null;
  readonly can_manage_posts: boolean;
  readonly can_rename_circles: boolean;
  readonly can_rename_districts: boolean;
  readonly can_rename_divisions: boolean;
  readonly can_sanction_circle_posts: boolean;
}

export interface JurisdictionGovernanceOverview {
  readonly actor: JurisdictionGovernanceActorCapabilities;
  readonly divisions: readonly GovernanceDivisionRecord[];
  readonly districts: readonly GovernanceDistrictRecord[];
  readonly tehsils: readonly GovernanceTehsilRecord[];
  readonly circles: readonly GovernanceCircleWithPostsRecord[];
  readonly supervisory_posts: readonly SanctionedPostRecord[];
  readonly posts: readonly SanctionedPostRecord[];
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

export async function fetchOfficersDirectory(options?: {
  readonly force?: boolean | undefined;
}): Promise<LiveOfficerAccount[]> {
  return getOrFetchCached(
    PTAS_CACHE_KEYS.OFFICERS_DIRECTORY,
    60_000,
    async () => {
      const supabase = getSupabaseAuthClient();
      const { data, error } = await supabase.rpc("get_officers_directory");
      if (error) {
        throw new Error(`Failed to load officers directory: ${error.message}`);
      }
      if (!Array.isArray(data)) return [];
      return data as unknown as LiveOfficerAccount[];
    },
    { force: options?.force }
  );
}

export async function fetchJurisdictionGovernanceOverview(options?: {
  readonly force?: boolean | undefined;
}): Promise<JurisdictionGovernanceOverview> {
  return getOrFetchCached(
    PTAS_CACHE_KEYS.JURISDICTION_GOVERNANCE_OVERVIEW,
    120_000,
    async () => {
      const supabase = getSupabaseAuthClient();
      const { data, error } = await supabase.rpc("get_jurisdiction_governance_overview");
      if (error) {
        throw new Error(`Failed to load jurisdiction governance overview: ${error.message}`);
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Invalid jurisdiction governance payload returned by server");
      }
      return data as unknown as JurisdictionGovernanceOverview;
    },
    { force: options?.force }
  );
}

export async function fetchDistrictGovernanceMatrix(options?: {
  readonly force?: boolean | undefined;
}): Promise<GovernanceCircleRecord[]> {
  return getOrFetchCached(
    PTAS_CACHE_KEYS.GOVERNANCE_MATRIX,
    300_000,
    async () => {
      const supabase = getSupabaseAuthClient();
      const { data, error } = await supabase.rpc("get_district_governance_matrix");
      if (error) {
        throw new Error(`Failed to load governance matrix: ${error.message}`);
      }
      if (!Array.isArray(data)) return [];
      return data as unknown as GovernanceCircleRecord[];
    },
    { force: options?.force }
  );
}

export async function fetchUserManagementAuditLog(
  limit = 100,
  options?: { readonly force?: boolean | undefined }
): Promise<LiveAuditRecord[]> {
  return getOrFetchCached(
    `${PTAS_CACHE_KEYS.USER_MGMT_AUDIT_PREFIX}${limit}`,
    60_000,
    async () => {
      const supabase = getSupabaseAuthClient();
      const { data, error } = await supabase.rpc("get_user_management_audit_log", {
        p_limit: limit
      });
      if (error) {
        throw new Error(`Failed to load user management audit logs: ${error.message}`);
      }
      if (!Array.isArray(data)) return [];
      return data as unknown as LiveAuditRecord[];
    },
    { force: options?.force }
  );
}

function invalidateUserManagementCaches(): void {
  invalidateQueryCache([
    PTAS_CACHE_KEYS.OFFICERS_DIRECTORY,
    PTAS_CACHE_KEYS.GOVERNANCE_MATRIX,
    PTAS_CACHE_KEYS.JURISDICTION_GOVERNANCE_OVERVIEW
  ]);
  invalidateQueryCachePrefix(PTAS_CACHE_KEYS.USER_MGMT_AUDIT_PREFIX);
}

export async function updateOfficerProfile(params: {
  userId: string;
  displayName: string;
  phone: string;
  cnic: string;
  designation: string;
  officeAddress: string;
  ppoNumber?: string;
  fatherName?: string;
  bpsScale?: number;
}): Promise<void> {
  const supabase = getSupabaseAuthClient();
  const { error } = await supabase.rpc("update_officer_profile", {
    p_user_id: params.userId,
    p_display_name: params.displayName,
    p_phone: params.phone,
    p_cnic: params.cnic,
    p_designation: params.designation,
    p_office_address: params.officeAddress,
    p_ppo_number: params.ppoNumber || null,
    p_father_name: params.fatherName || null,
    p_bps_scale: params.bpsScale ?? null
  });
  if (error) {
    throw new Error(`Failed to update profile: ${error.message}`);
  }
  invalidateUserManagementCaches();
}

export async function assignOfficerToPost(params: {
  postId: string;
  userId: string;
  chargeType?: PostChargeType;
  transferOrderNumber: string;
  handingOverNotes?: string;
  relieveCurrentIncumbent?: boolean;
}): Promise<void> {
  const supabase = getSupabaseAuthClient();
  const { error } = await supabase.rpc("assign_officer_to_post", {
    p_post_id: params.postId,
    p_user_id: params.userId,
    p_charge_type: params.chargeType ?? "SUBSTANTIVE",
    p_transfer_order_number: params.transferOrderNumber,
    p_handing_over_notes: params.handingOverNotes || null,
    p_relieve_current_incumbent: params.relieveCurrentIncumbent ?? false
  });
  if (error) {
    throw new Error(`Failed to assign officer to sanctioned post: ${error.message}`);
  }
  invalidateUserManagementCaches();
}

export async function relieveOfficerFromPost(params: {
  postId: string;
  reason: string;
  transferOrderNumber?: string;
}): Promise<void> {
  const supabase = getSupabaseAuthClient();
  const { error } = await supabase.rpc("relieve_officer_from_post", {
    p_post_id: params.postId,
    p_reason: params.reason,
    p_transfer_order_number: params.transferOrderNumber || null
  });
  if (error) {
    throw new Error(`Failed to relieve officer from post: ${error.message}`);
  }
  invalidateUserManagementCaches();
}

export async function renameJurisdictionEntity(params: {
  entityType: "CIRCLE" | "DISTRICT" | "DIVISION";
  entityId: string;
  newName: string;
  reason: string;
}): Promise<void> {
  const supabase = getSupabaseAuthClient();
  const { error } = await supabase.rpc("rename_jurisdiction_entity", {
    p_entity_type: params.entityType,
    p_entity_id: params.entityId,
    p_new_name: params.newName,
    p_reason: params.reason
  });
  if (error) {
    throw new Error(`Failed to rename ${params.entityType.toLowerCase()}: ${error.message}`);
  }
  invalidateUserManagementCaches();
}

export async function sanctionCirclePost(params: {
  circleId: string;
  roleCode: "ETI" | "ETC";
  sanctionedOrderNo: string;
  reason?: string;
}): Promise<void> {
  const supabase = getSupabaseAuthClient();
  const { error } = await supabase.rpc("sanction_circle_post", {
    p_circle_id: params.circleId,
    p_role_code: params.roleCode,
    p_sanctioned_order_no: params.sanctionedOrderNo,
    p_reason: params.reason || null
  });
  if (error) {
    throw new Error(`Failed to sanction additional circle post: ${error.message}`);
  }
  invalidateUserManagementCaches();
}

export async function transferOfficerPosting(params: {
  userId: string;
  targetCircleId: string;
  transferOrderNumber: string;
  isPrimary?: boolean;
  handingOverNotes?: string;
  relieveCurrentIncumbent?: boolean;
}): Promise<void> {
  const supabase = getSupabaseAuthClient();
  const { error } = await supabase.rpc("transfer_officer_posting", {
    p_user_id: params.userId,
    p_target_circle_id: params.targetCircleId,
    p_transfer_order_number: params.transferOrderNumber,
    p_is_primary: params.isPrimary ?? true,
    p_handing_over_notes: params.handingOverNotes || null,
    p_relieve_current_incumbent: params.relieveCurrentIncumbent ?? false
  });
  if (error) {
    throw new Error(`Failed to execute posting transfer: ${error.message}`);
  }
  invalidateUserManagementCaches();
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
  invalidateUserManagementCaches();
}

export async function attachCircleToTehsil(params: {
  circleId: string;
  tehsilId: string | null;
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
  invalidateUserManagementCaches();
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
  invalidateUserManagementCaches();
}

export async function adminSetOfficerPassword(params: {
  targetUserId: string;
  newPassword: string;
  mustChange?: boolean;
}): Promise<void> {
  if (params.newPassword.length < 12) {
    throw new Error("Password must be at least 12 characters.");
  }
  const supabase = getSupabaseAuthClient();
  const { error } = await supabase.rpc("admin_set_officer_password", {
    p_target_user_id: params.targetUserId,
    p_new_password: params.newPassword,
    p_must_change: params.mustChange ?? true
  });
  if (error) {
    throw new Error(`Failed to set officer password: ${error.message}`);
  }
  invalidateUserManagementCaches();
}

export type ProvisionableCadreRole = "INSPECTOR" | "ETI" | "ETC" | "ETO" | "DET" | "DIRECTOR";

function defaultBpsForCadre(role: ProvisionableCadreRole): number {
  const canon = normalizeCadreCode(role);
  if (canon === "DET" || canon === "ETO" || canon === "ETI" || canon === "ETC") {
    return CADRE_BPS_BOUNDS[canon].min;
  }
  return 16;
}

export async function adminCreateOfficer(params: {
  name: string;
  email: string;
  role: ProvisionableCadreRole;
  circleId: string | null;
  postId?: string | null;
  phone: string;
  cnic: string;
  designation: string;
  officeAddress: string;
  initialPassword: string;
  ppoNumber?: string;
  fatherName?: string;
  bpsScale?: number;
  transferOrderNumber?: string;
}): Promise<{ id: string; name: string; email: string }> {
  if (params.initialPassword.length < 12) {
    throw new Error("Initial password must be at least 12 characters.");
  }
  const supabase = getSupabaseAuthClient();
  const rpcPayload: Record<string, unknown> = {
    p_name: params.name,
    p_email: params.email,
    p_role: params.role,
    p_circle_id: params.circleId,
    p_phone: params.phone,
    p_cnic: params.cnic,
    p_designation: params.designation,
    p_office_address: params.officeAddress,
    p_initial_password: params.initialPassword,
    p_ppo_number: params.ppoNumber || null,
    p_father_name: params.fatherName || null,
    p_bps_scale: params.bpsScale ?? defaultBpsForCadre(params.role),
    p_transfer_order_number: params.transferOrderNumber || null
  };
  if (params.postId) {
    rpcPayload.p_post_id = params.postId;
  }
  const { data, error } = await supabase.rpc("admin_create_officer", rpcPayload as never);
  if (error) {
    throw new Error(`Failed to create officer: ${error.message}`);
  }
  invalidateUserManagementCaches();
  return data as unknown as { id: string; name: string; email: string };
}
