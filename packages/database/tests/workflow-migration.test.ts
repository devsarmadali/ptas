import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(new URL("../migrations/0002_workflow_command_layer.sql", import.meta.url)),
  "utf8"
);

describe("workflow command migration", () => {
  it("uses row locks, expected versions, idempotency, and transactional audit", () => {
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("p_expected_version");
    expect(migration).toContain("idempotency_key");
    expect(migration).toContain("append_workflow_audit");
  });

  it("prevents duplicate official records and pending deletion requests", () => {
    expect(migration).toContain("survey_unit_id uuid NOT NULL UNIQUE");
    expect(migration).toContain("assessment_id uuid NOT NULL UNIQUE");
    expect(migration).toContain("demand_deletion_one_pending");
    expect(migration).toContain("bank_transaction_id text NOT NULL UNIQUE");
  });

  it("keeps administrative cancellation separate from receipt eligibility", () => {
    expect(migration).toContain("administrative_state challan_administrative_state");
    expect(migration).toContain("payment_state challan_payment_state");
    expect(migration).toContain("c.administrative_state='PREPARED'");
  });

  it("enables RLS, revokes client writes, and resolves active assignments server-side", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON");
    expect(migration).toContain("ptas_private.active_actor");
    expect(migration).toContain("u.auth_user_id = (SELECT auth.uid())");
  });

  it("schedules idempotent cancellation on the Pakistan business date", () => {
    expect(migration).toContain("ptas-cancel-overdue-pft2");
    expect(migration).toContain("Asia/Karachi");
    expect(migration).toContain("p_business_date > due_date + 3");
    expect(migration).toContain("administrative_state='ISSUED'");
  });
});
