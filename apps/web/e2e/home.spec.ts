import { expect, test } from "@playwright/test";

test("renders official PTAS header and unified route hubs", async ({ page }) => {
  page.on("pageerror", (err) => console.error("CLIENT_PAGE_ERROR:", err.stack || err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error("CLIENT_PAGE_LOG:", msg.text());
    }
  });
  await page.goto("/assessment");
  await expect(
    page.getByRole("heading", {
      name: /Government of the Punjab — Professional Tax Administration/i
    })
  ).toBeVisible({ timeout: 20000 });

  // Verify all 5 unified route hubs are visible as links
  await expect(page.getByRole("link", { name: /Assessment & Field Desk/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Compliance & Recovery/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Revenue & Collections Desk/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Intelligence & Governance/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Administration & Access/i })).toBeVisible();

  // Verify contextual subtabs in Assessment Hub
  await expect(
    page.getByRole("link", { name: /Form P\.F\.T-3 Assessment Register/i })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Tax Units & Survey/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Assessment Queue/i })).toBeVisible();

  // Verify metric cards row is completely removed from coding and UI
  await expect(page.locator(".metric-grid")).toHaveCount(0);
  await expect(page.getByLabel("District Vehari Summary Metrics")).toHaveCount(0);
});

test("navigates across unified route hubs and contextual sub-tabs", async ({ page }) => {
  await page.goto("/assessment");
  await expect(
    page.getByRole("heading", {
      name: /Government of the Punjab — Professional Tax Administration/i
    })
  ).toBeVisible({ timeout: 20000 });

  // Switch to Intelligence & Governance Route Hub
  await page.getByRole("link", { name: /Intelligence & Governance/i }).click();
  await expect(page).toHaveURL(/.*intelligence/);
  await expect(page.getByRole("link", { name: /Analytics Dashboard/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Statutory Gazette & Reports/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Statutory Category Yield & Slabs/i })).toBeVisible();

  // Verify 47-slab distribution table is visible in Analytics
  await expect(
    page.getByText(/Statutory Second Schedule Sub-Class & Tertiary Slab Distribution/i)
  ).toBeVisible();

  // Switch to Reports Studio
  await page.getByRole("link", { name: /Statutory Gazette & Reports/i }).click();
  await expect(page).toHaveURL(/.*intelligence\/reports/);
  await expect(
    page.getByText(/Statutory Registers & Detailed Revenue Reporting Studio/i)
  ).toBeVisible();
});

test("verifies statutory sub-class and tertiary slabs in Form P.F.T-1 and Form P.F.T-2", async ({
  page
}) => {
  await page.goto("/assessment");
  await expect(
    page.getByRole("heading", {
      name: /Government of the Punjab — Professional Tax Administration/i
    })
  ).toBeVisible({ timeout: 20000 });

  // Open Form P.F.T-1 via the Form PFT-3 Register where approved assessees reside
  await page.getByRole("link", { name: /Form P\.F\.T-3 Assessment Register/i }).click();
  await expect(page).toHaveURL(/.*assessment\/pft3/);
  await expect(page.getByRole("heading", { name: /Form P\.F\.T-3/i })).toBeVisible();

  const pagePromise = page.context().waitForEvent("page");
  await page.locator(".action-menu-trigger").first().click();
  await page.getByRole("menuitem", { name: /View Form P\.F\.T-1/i }).click();
  const pft1Page = await pagePromise;
  await pft1Page.waitForLoadState();
  await expect(pft1Page.getByText(/FORM P\.F\.T-1/i).first()).toBeVisible();
  await expect(pft1Page.getByText(/NOTICE OF TAX DEMAND/i).first()).toBeVisible();
  await pft1Page.close();

  // Navigate to Revenue Hub -> Form PFT-2 Challans
  await page.getByRole("link", { name: /Revenue & Collections Desk/i }).click();
  await expect(page).toHaveURL(/.*revenue/);
  await expect(page.getByRole("link", { name: /Form PFT-2 Challans/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /ePay Punjab Reconciliation/i })).toBeVisible();
  await page.getByRole("link", { name: /Form PFT-2 Challans/i }).click();
  await expect(page.locator(".action-menu-trigger").first()).toBeVisible();

  // Trigger single Form PFT-2 Challan PDF download
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".action-menu-trigger").first().click();
  await page.getByRole("menuitem", { name: /Download Challan PDF/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/Form_PFT2_Challan.*\.pdf/i);

  // Switch to ePay Punjab Reconciliation tab
  await page.getByRole("link", { name: /ePay Punjab Reconciliation/i }).click();
  await expect(page).toHaveURL(/.*revenue\/epay/);
  await expect(
    page.getByRole("heading", { name: /ePay Punjab Real-Time Reconciliation Hub/i })
  ).toBeVisible();
});

test("verifies RowActionMenu popover interactions in Compliance & Recovery Hub", async ({
  page
}) => {
  await page.goto("/assessment");
  await expect(
    page.getByRole("heading", {
      name: /Government of the Punjab — Professional Tax Administration/i
    })
  ).toBeVisible({ timeout: 20000 });

  // Navigate to Compliance & Recovery Route Hub
  await page.getByRole("link", { name: /Compliance & Recovery/i }).click();
  await expect(page).toHaveURL(/.*enforcement/);
  await expect(page.getByRole("link", { name: /Defaulter & Arrears Roll/i })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Land Revenue Recovery \(Rule 12\)/i })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Defaulter Tracking/i })).toBeVisible();

  // Open Defaulter row action menu
  await page.locator(".action-menu-trigger").first().click();
  await expect(page.getByRole("menuitem", { name: /Issue Show Cause Notice/i })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Impose Statutory Penalty/i })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Certify Arrears/i })).toBeVisible();

  // Open Show Cause modal
  await page.getByRole("menuitem", { name: /Issue Show Cause Notice/i }).click();
  await expect(
    page.getByRole("heading", {
      name: /Notice to Show Cause for Imposition of Penalty/i
    })
  ).toBeVisible();
  await page.getByLabel("Close").click();

  // Navigate to Clearance subtab
  await page.getByRole("link", { name: /Tax Clearance Certificates/i }).click();
  await expect(page).toHaveURL(/.*enforcement\/clearance/);
  await expect(page.locator(".action-menu-trigger").first()).toBeVisible();
  await page.locator(".action-menu-trigger").first().click();
  await expect(page.getByRole("menuitem", { name: /Clearance/i })).toBeVisible();
});

test("verifies sign out leads to sign-in page and role pre-filled sign-in works", async ({
  page
}) => {
  await page.goto("/assessment");
  await expect(
    page.getByRole("heading", {
      name: /Government of the Punjab — Professional Tax Administration/i
    })
  ).toBeVisible({ timeout: 20000 });

  // Click Sign Out
  await page.getByRole("button", { name: /Sign Out/i }).click();

  // Expect navigation to /sign-in page
  await expect(page).toHaveURL(/.*sign-in/);
  await expect(
    page.getByRole("heading", { name: /Statutory Role Sign In & Access Control/i })
  ).toBeVisible();

  // Verify all 4 pre-filled roles exist (including Admin)
  await expect(page.getByRole("heading", { name: "Muhammad Aslam" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tariq Mahmood" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shahid Nawaz" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Provincial Administrator" })).toBeVisible();

  // Click one-click sign in as ETO
  await page.getByRole("button", { name: /One-Click Sign In as ETO/i }).click();

  // Expect redirection back to dashboard with ETO session active
  await expect(page).toHaveURL(/.*assessment/);
  await expect(page.getByText(/Tariq Mahmood/i).first()).toBeVisible();

  // Non-admin roles (ETO, Inspector, Director) must NOT see pilot/sync/auth buttons in app header
  await expect(page.getByText(/PILOT READY/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Sync Supabase/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Reset Demo/i })).toHaveCount(0);
  await expect(page.getByText(/Supabase Auth/i)).toHaveCount(0);

  // Sign out again and sign in as Admin
  await page.getByRole("button", { name: /Sign Out/i }).click();
  await expect(page).toHaveURL(/.*sign-in/);

  // Click one-click sign in as ADMIN
  await page.getByRole("button", { name: /One-Click Sign In as ADMIN/i }).click();
  await expect(page).toHaveURL(/.*assessment/);
  await expect(page.getByText(/Provincial Administrator/i).first()).toBeVisible();

  // Admin MUST see the administration/system buttons in app header
  await expect(page.getByText(/PILOT READY • VERCEL/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Sync Supabase/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Reset Demo/i })).toBeVisible();
});
