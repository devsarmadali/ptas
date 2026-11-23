import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL("../migrations/0061_security_and_data_integrity_hardening.sql", import.meta.url)
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261123120000_security_and_data_integrity_hardening.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("security and data integrity hardening migration (0061)", () => {
  it("keeps repository and deployable migrations byte-for-byte identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("revokes dangerous table/truncate grants and removes direct write RLS bypass policies", () => {
    expect(packageMigration).toContain(
      "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;"
    );
    expect(packageMigration).toContain("DROP POLICY IF EXISTS pft3_assessment_units_all");
    expect(packageMigration).toContain("DROP POLICY IF EXISTS pft2_receipts_write");
    expect(packageMigration).toContain("DROP POLICY IF EXISTS assessment_versions_insert_policy");
    expect(packageMigration).toContain("DROP POLICY IF EXISTS potential_assessment_units_write");
    expect(packageMigration).toContain("DROP POLICY IF EXISTS potential_assessment_units_update");
    expect(packageMigration).toContain("DROP POLICY IF EXISTS potential_pft2_challans_select");
    expect(packageMigration).toContain("DROP POLICY IF EXISTS app_users_select");
    expect(packageMigration).toContain("DROP POLICY IF EXISTS pft2_receipts_select");
    expect(packageMigration).toContain("DROP POLICY IF EXISTS audit_select");
    expect(packageMigration).toContain("survey_import_batches.jurisdiction_id");
  });

  it("locks down storage buckets and anonymous/legacy storage object policies", () => {
    expect(packageMigration).toContain(
      'DROP POLICY IF EXISTS "Allow anon upload receipts for pilot demo" ON storage.objects'
    );
    expect(packageMigration).toContain(
      'DROP POLICY IF EXISTS "Allow anon read receipts for pilot demo" ON storage.objects'
    );
    expect(packageMigration).toContain(
      'DROP POLICY IF EXISTS "Allow authenticated read receipts" ON storage.objects'
    );
    expect(packageMigration).toContain(
      'DROP POLICY IF EXISTS "Allow authenticated upload receipts" ON storage.objects'
    );
    expect(packageMigration).toContain("file_size_limit = 5242880");
    expect(packageMigration).toContain("file_size_limit = 10485760");
  });

  it("enforces immutability triggers, unique bank scroll indexes, and double-payment protection", () => {
    expect(packageMigration).toContain("trg_pft2_receipts_immutable");
    expect(packageMigration).toContain("trg_assessment_versions_immutable");
    expect(packageMigration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_pft2_receipts_challan_id"
    );
    expect(packageMigration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_pft2_receipts_bank_txn"
    );
    expect(packageMigration).toContain("IF v_payment_state <> 'OUTSTANDING'");
    expect(packageMigration).toContain("IF v_admin_state = 'PREPARED'");
    expect(packageMigration).toContain("ptas_private.migrate_potential_unit_to_pft3_internal");
    expect(packageMigration).toContain("IF v_payment_state = 'RECEIVED' THEN");
  });

  it("drops vulnerable legacy overloads and blocks privilege escalation in user management RPCs", () => {
    expect(packageMigration).toContain(
      "DROP FUNCTION IF EXISTS public.verify_ptas_public_document(text);"
    );
    expect(packageMigration).toContain("DROP FUNCTION IF EXISTS public.test_drop_trigger();");
    expect(packageMigration).toContain(
      "DROP FUNCTION IF EXISTS public.admin_create_officer(text, text, text, uuid, text, text, text, text, text);"
    );
    expect(packageMigration).toContain(
      "DROP FUNCTION IF EXISTS public.admin_set_officer_password(uuid, text);"
    );
    expect(packageMigration).toContain(
      "DROP FUNCTION IF EXISTS public.update_officer_profile(uuid, text, text, text, text, text);"
    );
    expect(packageMigration).toContain("ptas_private.can_manage_target_role");
    expect(packageMigration).toContain("ptas_private.revoke_user_auth_sessions");
    expect(packageMigration).toContain("length(coalesce(p_initial_password, '')) < 12");
    expect(packageMigration).toContain("an officer account with this email already exists");
    expect(packageMigration).toContain(
      "officers cannot suspend or toggle their own account status"
    );
  });

  it("eliminates IDOR, cross-jurisdiction hijack, fail-open NULLs, and public draft/PII leaks", () => {
    expect(packageMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_assessment_versions(p_unit_id uuid)"
    );
    expect(packageMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.update_individual_survey_unit"
    );
    expect(packageMigration).toContain("CREATE OR REPLACE FUNCTION public.transition_pft2_challan");
    expect(packageMigration).toContain("paid challan cannot be cancelled");
    expect(packageMigration).toContain("target unit is outside your assigned jurisdiction");
    expect(packageMigration).toContain(
      "Target potential unit is outside your assigned jurisdiction"
    );
    expect(packageMigration).toContain("WHERE p.state = 'APPROVED'");
    expect(packageMigration).toContain("jsonb_array_length(p_units) > 5000");
    expect(packageMigration).toContain("v_direct_enroll := (\n    v_actor.role_code = 'ETO'");
  });

  it("isolates table DDL into single-table transactions and guards redundant RLS locks against deadlocks", () => {
    expect(packageMigration).toContain(
      "AND c.relname = 'workflow_actions' AND NOT c.relrowsecurity"
    );
    expect(packageMigration).toContain(
      "AND c.relname = 'district_monthly_notice_sequences' AND NOT c.relrowsecurity"
    );
    expect(packageMigration).toContain(
      "AND c.relname = 'potential_pft2_challans_deprecated' AND NOT c.relrowsecurity"
    );

    const begins = packageMigration.match(/^BEGIN;$/gm) ?? [];
    const commits = packageMigration.match(/^COMMIT;$/gm) ?? [];
    expect(begins.length).toBeGreaterThanOrEqual(15);
    expect(commits.length).toBe(begins.length);

    const ddlTargetsInOrder = [
      "CREATE POLICY app_users_select",
      "CREATE POLICY user_roles_select",
      "CREATE POLICY user_jurisdiction_assignments_select",
      "CREATE POLICY pft3_assessment_units_select",
      "CREATE POLICY pft2_receipts_select",
      "CREATE POLICY audit_select",
      "CREATE TRIGGER trg_pft2_receipts_immutable",
      "CREATE TRIGGER trg_assessment_versions_immutable"
    ];

    for (let i = 0; i < ddlTargetsInOrder.length - 1; i += 1) {
      const firstIndex = packageMigration.indexOf(ddlTargetsInOrder[i]!);
      const secondIndex = packageMigration.indexOf(ddlTargetsInOrder[i + 1]!);
      expect(firstIndex).toBeGreaterThan(-1);
      expect(secondIndex).toBeGreaterThan(firstIndex);
      const between = packageMigration.slice(firstIndex, secondIndex);
      expect(between).toMatch(/COMMIT;[\s\S]*BEGIN;/);
    }
  });
});
