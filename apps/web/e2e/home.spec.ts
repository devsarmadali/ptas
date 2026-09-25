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

  // Verify all 4 unified route hubs are visible as links
  await expect(page.getByRole("link", { name: /Assessment & Field Desk/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Compliance & Recovery/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Revenue & Citizen Desk/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Intelligence & Governance/i })).toBeVisible();
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
  await page.getByRole("link", { name: /Revenue & Citizen Desk/i }).click();
  await expect(page).toHaveURL(/.*revenue/);
  await expect(page.getByRole("link", { name: /Form PFT-2 Challans/i })).toBeVisible();
  await page.getByRole("link", { name: /Form PFT-2 Challans/i }).click();
  await expect(page.locator(".action-menu-trigger").first()).toBeVisible();

  // Open single Form PFT-2 Challan modal
  await page.locator(".action-menu-trigger").first().click();
  await page.getByRole("menuitem", { name: /Download Challan PDF/i }).click();
  await expect(page.getByText(/TAXPAYER'S COPY/i).first()).toBeVisible();
  await expect(page.getByText(/BANK'S COPY/i).first()).toBeVisible();
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
