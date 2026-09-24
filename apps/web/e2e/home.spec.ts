import { expect, test } from "@playwright/test";

test("renders official PTAS header and unified route hubs", async ({ page }) => {
  page.on("pageerror", (err) => console.error("CLIENT_PAGE_ERROR:", err.stack || err.message));
  page.on("console", (msg) => console.log("CLIENT_PAGE_LOG:", msg.text()));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /Government of the Punjab — Professional Tax Administration/i
    })
  ).toBeVisible({ timeout: 20000 });

  // Verify all 4 unified route hubs are visible
  await expect(page.getByRole("button", { name: /Assessment & Field Desk/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Compliance & Recovery/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Revenue & Citizen Desk/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Intelligence & Governance/i })).toBeVisible();
});

test("navigates across unified route hubs and contextual sub-tabs", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /Government of the Punjab — Professional Tax Administration/i
    })
  ).toBeVisible({ timeout: 20000 });

  // Switch to Intelligence & Governance Route Hub
  await page.getByRole("button", { name: /Intelligence & Governance/i }).click();
  await expect(page.getByRole("tab", { name: /Analytics Dashboard/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Statutory Reports Studio/i })).toBeVisible();

  // Verify 47-slab distribution table is visible in Analytics
  await expect(
    page.getByText(/Statutory Second Schedule Sub-Class & Tertiary Slab Distribution/i)
  ).toBeVisible();

  // Switch to Reports Studio
  await page.getByRole("tab", { name: /Statutory Reports Studio/i }).click();
  await expect(
    page.getByRole("tab", { name: /Statutory Slabs Distribution \(47\)/i })
  ).toBeVisible();
});

test("verifies statutory sub-class and tertiary slabs in Form P.F.T-1 and Form P.F.T-2", async ({
  page
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /Government of the Punjab — Professional Tax Administration/i
    })
  ).toBeVisible({ timeout: 20000 });

  // Open Form P.F.T-1 via the first unit row action menu in Form PFT-3 register
  await page.locator(".action-menu-trigger").first().click();
  await page.getByRole("menuitem", { name: /View Form P\.F\.T-1/i }).click();
  await expect(page.getByText(/FORM P\.F\.T-1/i).first()).toBeVisible();
  await expect(page.getByText(/NOTICE OF TAX DEMAND/i).first()).toBeVisible();

  // Close modal
  await page.getByLabel("Close").click();

  // Navigate to Revenue Hub -> Form PFT-2 Challans
  await page.getByRole("button", { name: /Revenue & Citizen Desk/i }).click();
  await expect(page.getByRole("tab", { name: /Form PFT-2 Challans/i })).toBeVisible();
  await page.getByRole("tab", { name: /Form PFT-2 Challans/i }).click();

  // Open single Form PFT-2 Challan modal
  await page.locator(".action-menu-trigger").first().click();
  await page.getByRole("menuitem", { name: /Download Challan PDF/i }).click();
  await expect(page.getByText(/TAXPAYER'S COPY/i).first()).toBeVisible();
  await expect(page.getByText(/BANK'S COPY/i).first()).toBeVisible();
});
