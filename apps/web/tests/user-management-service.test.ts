import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("../src/lib/supabase-auth.js", () => ({
  getSupabaseAuthClient: () => ({
    rpc
  })
}));

import { clearAllQueryCaches } from "../src/lib/query-cache.js";

import {
  adminCreateOfficer,
  adminSetOfficerPassword,
  assignOfficerToPost,
  attachCircleToTehsil,
  fetchDistrictGovernanceMatrix,
  fetchJurisdictionGovernanceOverview,
  fetchOfficersDirectory,
  fetchUserManagementAuditLog,
  relieveOfficerFromPost,
  renameJurisdictionEntity,
  sanctionCirclePost,
  setOfficerStatus,
  transferOfficerPosting,
  updateOfficerProfile
} from "../src/lib/user-management-service.js";

describe("PTAS User Management & Cadre Service", () => {
  afterEach(() => {
    clearAllQueryCaches();
    vi.restoreAllMocks();
    rpc.mockReset();
  });

  it("fetches officers directory through get_officers_directory RPC", async () => {
    const mockOfficers = [
      {
        user_id: "u-1",
        name: "Bashir Ahmad Kharal",
        email: "etovehari@example.com",
        role: "ETO",
        ppo_number: "PPO-ETO-36603-01",
        bps_scale: 17,
        circle_code: "DIST_VEH",
        active: true
      }
    ];
    rpc.mockResolvedValue({ data: mockOfficers, error: null });

    const result = await fetchOfficersDirectory();
    expect(rpc).toHaveBeenCalledWith("get_officers_directory");
    expect(result).toEqual(mockOfficers);
  });

  it("fetches district governance matrix with permanent circles and vacancies", async () => {
    const mockMatrix = [
      {
        circle_id: "c-1",
        circle_code: "VHR-1",
        circle_name: "Circle 1 Vehari",
        inspector_id: "ins-1",
        inspector_name: "Muhammad Nasir Khan",
        inspector_ppo: "PPO-ETI-36603-04",
        is_primary_charge: true,
        units_count: 434
      },
      {
        circle_id: "c-2",
        circle_code: "VHR-2",
        circle_name: "Circle 2 Vehari",
        inspector_id: null,
        inspector_name: null,
        units_count: 0
      }
    ];
    rpc.mockResolvedValue({ data: mockMatrix, error: null });

    const result = await fetchDistrictGovernanceMatrix();
    expect(rpc).toHaveBeenCalledWith("get_district_governance_matrix");
    expect(result).toHaveLength(2);
    expect(result[0]!.inspector_ppo).toBe("PPO-ETI-36603-04");
    expect(result[1]!.inspector_id).toBeNull();
  });

  it("provisions an officer with civil service cadre attributes", async () => {
    rpc.mockResolvedValue({
      data: { id: "u-new", name: "Tariq Mehmood", email: "tariq@example.com" },
      error: null
    });

    const res = await adminCreateOfficer({
      name: "Tariq Mehmood",
      email: "tariq@example.com",
      role: "INSPECTOR",
      circleId: "c-2",
      phone: "0300-1122334",
      cnic: "36603-1122334-1",
      designation: "Excise & Taxation Inspector",
      officeAddress: "Tehsil Complex Burewala",
      initialPassword: "TempPassword123!",
      ppoNumber: "PPO-ETI-36603-05",
      fatherName: "Mehmood Ul Hassan",
      bpsScale: 16,
      transferOrderNumber: "SO(Admin)ET/2026/042"
    });

    expect(rpc).toHaveBeenCalledWith("admin_create_officer", {
      p_name: "Tariq Mehmood",
      p_email: "tariq@example.com",
      p_role: "INSPECTOR",
      p_circle_id: "c-2",
      p_phone: "0300-1122334",
      p_cnic: "36603-1122334-1",
      p_designation: "Excise & Taxation Inspector",
      p_office_address: "Tehsil Complex Burewala",
      p_initial_password: "TempPassword123!",
      p_ppo_number: "PPO-ETI-36603-05",
      p_father_name: "Mehmood Ul Hassan",
      p_bps_scale: 16,
      p_transfer_order_number: "SO(Admin)ET/2026/042"
    });
    expect(res.id).toBe("u-new");
  });

  it("rejects officer provisioning if initial password is less than 12 characters", async () => {
    await expect(
      adminCreateOfficer({
        name: "Test",
        email: "test@example.com",
        role: "INSPECTOR",
        circleId: "c-1",
        phone: "0300",
        cnic: "36603",
        designation: "ETI",
        officeAddress: "Office",
        initialPassword: "123"
      })
    ).rejects.toThrow("Initial password must be at least 12 characters.");
  });

  it("executes official circle transfer and posting order", async () => {
    rpc.mockResolvedValue({
      data: { success: true },
      error: null
    });

    await transferOfficerPosting({
      userId: "u-1",
      targetCircleId: "c-2",
      transferOrderNumber: "SO(Admin)ET/2026/842",
      isPrimary: true,
      handingOverNotes: "Charge handed over peacefully",
      relieveCurrentIncumbent: true
    });

    expect(rpc).toHaveBeenCalledWith("transfer_officer_posting", {
      p_user_id: "u-1",
      p_target_circle_id: "c-2",
      p_transfer_order_number: "SO(Admin)ET/2026/842",
      p_is_primary: true,
      p_handing_over_notes: "Charge handed over peacefully",
      p_relieve_current_incumbent: true
    });
  });

  it("updates officer profile with civil service particulars", async () => {
    rpc.mockResolvedValue({ data: { success: true }, error: null });

    await updateOfficerProfile({
      userId: "u-1",
      displayName: "Bashir Ahmad Kharal",
      phone: "0300-8765432",
      cnic: "36603-1234567-1",
      designation: "Excise & Taxation Officer",
      officeAddress: "ETO Office Danewal Road Vehari",
      ppoNumber: "PPO-ETO-36603-01",
      fatherName: "Muhammad Kharal",
      bpsScale: 17
    });

    expect(rpc).toHaveBeenCalledWith("update_officer_profile", {
      p_user_id: "u-1",
      p_display_name: "Bashir Ahmad Kharal",
      p_phone: "0300-8765432",
      p_cnic: "36603-1234567-1",
      p_designation: "Excise & Taxation Officer",
      p_office_address: "ETO Office Danewal Road Vehari",
      p_ppo_number: "PPO-ETO-36603-01",
      p_father_name: "Muhammad Kharal",
      p_bps_scale: 17
    });
  });

  it("resets officer password with mandatory mustChange flag", async () => {
    rpc.mockResolvedValue({ data: { success: true }, error: null });

    await adminSetOfficerPassword({
      targetUserId: "u-target",
      newPassword: "NewSecretPassword123!",
      mustChange: true
    });

    expect(rpc).toHaveBeenCalledWith("admin_set_officer_password", {
      p_target_user_id: "u-target",
      p_new_password: "NewSecretPassword123!",
      p_must_change: true
    });
  });

  it("toggles officer active status with mandatory administrative justification", async () => {
    rpc.mockResolvedValue({ data: { success: true }, error: null });

    await setOfficerStatus({
      userId: "u-target",
      active: false,
      reason: "Placed on 30 days medical leave"
    });

    expect(rpc).toHaveBeenCalledWith("set_officer_status", {
      p_user_id: "u-target",
      p_active: false,
      p_reason: "Placed on 30 days medical leave"
    });
  });

  it("fetches user management audit log", async () => {
    rpc.mockResolvedValue({
      data: [{ id: "audit-1", event_type: "OFFICER_TRANSFERRED" }],
      error: null
    });

    const logs = await fetchUserManagementAuditLog(50);
    expect(rpc).toHaveBeenCalledWith("get_user_management_audit_log", { p_limit: 50 });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.event_type).toBe("OFFICER_TRANSFERRED");
  });

  it("loads consolidated jurisdiction governance overview and manages sanctioned posts, tehsils, and renames", async () => {
    const mockOverview = {
      actor: {
        user_id: "u-eto",
        role_code: "ETO",
        cadre_code: "ETO",
        bps_scale: 17,
        jurisdiction_id: "dist-vhr",
        jurisdiction_tier: "DISTRICT",
        can_manage_posts: true,
        can_rename_circles: true,
        can_rename_districts: false,
        can_rename_divisions: false,
        can_sanction_circle_posts: false
      },
      divisions: [],
      districts: [],
      tehsils: [
        {
          id: "teh-jallah",
          district_id: "dist-vhr",
          division_id: "div-mtn",
          tehsil_code: 105,
          name: "Jallah jeem",
          attached_circles_count: 0
        }
      ],
      circles: [],
      supervisory_posts: [],
      posts: []
    };
    rpc.mockResolvedValueOnce({ data: mockOverview, error: null });
    const loaded = await fetchJurisdictionGovernanceOverview();
    expect(rpc).toHaveBeenCalledWith("get_jurisdiction_governance_overview");
    expect(loaded.tehsils[0]!.name).toBe("Jallah jeem");

    rpc.mockResolvedValue({ data: { success: true }, error: null });

    await assignOfficerToPost({
      postId: "post-etc-vhr-1",
      userId: "u-constable",
      chargeType: "SUBSTANTIVE",
      transferOrderNumber: "ETO(Admin)VHR/2026/101",
      handingOverNotes: "Posted to Circle 1 notice delivery",
      relieveCurrentIncumbent: false
    });
    expect(rpc).toHaveBeenCalledWith("assign_officer_to_post", {
      p_post_id: "post-etc-vhr-1",
      p_user_id: "u-constable",
      p_charge_type: "SUBSTANTIVE",
      p_transfer_order_number: "ETO(Admin)VHR/2026/101",
      p_handing_over_notes: "Posted to Circle 1 notice delivery",
      p_relieve_current_incumbent: false
    });

    await relieveOfficerFromPost({
      postId: "post-eti-vhr-1",
      reason: "Transferred to Divisional Pool",
      transferOrderNumber: "SO(Admin)2026/99"
    });
    expect(rpc).toHaveBeenCalledWith("relieve_officer_from_post", {
      p_post_id: "post-eti-vhr-1",
      p_reason: "Transferred to Divisional Pool",
      p_transfer_order_number: "SO(Admin)2026/99"
    });

    await renameJurisdictionEntity({
      entityType: "CIRCLE",
      entityId: "cir-vhr-1",
      newName: "Circle Mailsi",
      reason: "District reorganization order"
    });
    expect(rpc).toHaveBeenCalledWith("rename_jurisdiction_entity", {
      p_entity_type: "CIRCLE",
      p_entity_id: "cir-vhr-1",
      p_new_name: "Circle Mailsi",
      p_reason: "District reorganization order"
    });

    await attachCircleToTehsil({
      circleId: "cir-vhr-1",
      tehsilId: null,
      reason: "Placed directly under District HQ"
    });
    expect(rpc).toHaveBeenCalledWith("attach_circle_to_tehsil", {
      p_circle_id: "cir-vhr-1",
      p_tehsil_id: null,
      p_reason: "Placed directly under District HQ"
    });

    await sanctionCirclePost({
      circleId: "cir-vhr-1",
      roleCode: "ETC",
      sanctionedOrderNo: "FD-SANCTION-2026-02",
      reason: "Additional constable needed"
    });
    expect(rpc).toHaveBeenCalledWith("sanction_circle_post", {
      p_circle_id: "cir-vhr-1",
      p_role_code: "ETC",
      p_sanctioned_order_no: "FD-SANCTION-2026-02",
      p_reason: "Additional constable needed"
    });

    rpc.mockResolvedValueOnce({
      data: { id: "u-etc-new", name: "Sajid Ali", email: "sajid@example.com" },
      error: null
    });
    await adminCreateOfficer({
      name: "Sajid Ali",
      email: "sajid@example.com",
      role: "ETC",
      circleId: "cir-vhr-1",
      postId: "post-etc-vhr-1",
      phone: "0300-0000001",
      cnic: "36603-0000001-1",
      designation: "Excise & Taxation Constable (Notice Delivery)",
      officeAddress: "Vehari",
      initialPassword: "StrongPassword123!"
    });
    expect(rpc).toHaveBeenLastCalledWith("admin_create_officer", {
      p_name: "Sajid Ali",
      p_email: "sajid@example.com",
      p_role: "ETC",
      p_circle_id: "cir-vhr-1",
      p_post_id: "post-etc-vhr-1",
      p_phone: "0300-0000001",
      p_cnic: "36603-0000001-1",
      p_designation: "Excise & Taxation Constable (Notice Delivery)",
      p_office_address: "Vehari",
      p_initial_password: "StrongPassword123!",
      p_ppo_number: null,
      p_father_name: null,
      p_bps_scale: 5,
      p_transfer_order_number: null
    });
  });
});
