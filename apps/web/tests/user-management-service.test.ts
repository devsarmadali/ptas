import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("../src/lib/supabase-auth.js", () => ({
  getSupabaseAuthClient: () => ({
    rpc
  })
}));

import {
  adminCreateOfficer,
  adminSetOfficerPassword,
  fetchDistrictGovernanceMatrix,
  fetchOfficersDirectory,
  fetchUserManagementAuditLog,
  setOfficerStatus,
  transferOfficerPosting,
  updateOfficerProfile
} from "../src/lib/user-management-service.js";

describe("PTAS User Management & Cadre Service", () => {
  afterEach(() => {
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

  it("rejects officer provisioning if initial password is less than 6 characters", async () => {
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
    ).rejects.toThrow("Initial password must be at least 6 characters.");
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
});
