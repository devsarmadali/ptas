import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageMigration = readFileSync(
  fileURLToPath(
    new URL("../migrations/0033_user_management_and_tehsil_circle_governance.sql", import.meta.url)
  ),
  "utf8"
);
const deployMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20261011190000_user_management_and_tehsil_circle_governance.sql",
      import.meta.url
    )
  ),
  "utf8"
);

describe("live user management and jurisdiction governance migration", () => {
  it("keeps repository and deployable migrations identical", () => {
    expect(deployMigration).toBe(packageMigration);
  });

  it("exports live officers directory with statutory actor verification", () => {
    expect(packageMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_officers_directory()"
    );
    expect(packageMigration).toContain("ptas_private.active_actor(NULL)");
    expect(packageMigration).toContain("public.app_users");
    expect(packageMigration).toContain("public.user_roles");
  });

  it("provides live district governance matrix with tehsil and circle attachments", () => {
    expect(packageMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_district_governance_matrix()"
    );
    expect(packageMigration).toContain("ptas_private.active_actor(NULL)");
    expect(packageMigration).toContain("FROM public.jurisdictions c");
    expect(packageMigration).toContain(
      "JOIN public.jurisdictions t ON t.id = c.parent_id AND t.tier = 'TEHSIL'"
    );
  });

  it("provides statutory Tehsil-to-Circle attachment with audit trail", () => {
    expect(packageMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.attach_circle_to_tehsil("
    );
    expect(packageMigration).toContain(
      "ptas_private.active_actor(ARRAY['ETO', 'ADMIN', 'DIRECTOR'])"
    );
    expect(packageMigration).toContain("UPDATE public.jurisdictions");
    expect(packageMigration).toContain("PERFORM ptas_private.audit_transition(");
    expect(packageMigration).toContain("'CIRCLE_TEHSIL_ATTACHED'");
  });

  it("provides circle reassignment with mandatory audit trail", () => {
    expect(packageMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.reassign_officer_circle("
    );
    expect(packageMigration).toContain(
      "ptas_private.active_actor(ARRAY['ETO', 'ADMIN', 'DIRECTOR'])"
    );
    expect(packageMigration).toContain("UPDATE public.user_roles");
    expect(packageMigration).toContain("'CIRCLE_REASSIGNED'");
  });

  it("provides secure admin password management with 6 char limit", () => {
    expect(packageMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.admin_set_officer_password("
    );
    expect(packageMigration).toContain("length(btrim(coalesce(p_new_password, ''))) < 6");
    expect(packageMigration).toContain("extensions.crypt(p_new_password");
  });

  it("provides comprehensive officer creation and provisioning", () => {
    expect(packageMigration).toContain("CREATE OR REPLACE FUNCTION public.admin_create_officer(");
    expect(packageMigration).toContain("INSERT INTO auth.users");
    expect(packageMigration).toContain("INSERT INTO public.app_users");
    expect(packageMigration).toContain("INSERT INTO public.user_roles");
    expect(packageMigration).toContain("'OFFICER_PROVISIONED'");
  });

  it("enforces statutory security barriers on all RPC functions", () => {
    expect(packageMigration).toContain(
      "REVOKE ALL ON FUNCTION public.get_officers_directory() FROM PUBLIC, anon;"
    );
    expect(packageMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_officers_directory() TO authenticated;"
    );
    expect(packageMigration).toContain(
      "REVOKE ALL ON FUNCTION public.attach_circle_to_tehsil(uuid, uuid, text) FROM PUBLIC, anon;"
    );
    expect(packageMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.attach_circle_to_tehsil(uuid, uuid, text) TO authenticated;"
    );
  });
});
