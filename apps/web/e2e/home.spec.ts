import { expect, test } from "@playwright/test";

const retiredPilotIdentities = [
  "Muhammad Aslam",
  "Tariq Mahmood",
  "inspector.vehari@punjab.gov.pk",
  "eto.vehari@punjab.gov.pk"
];

test("protected PTAS routes fail closed without a Supabase session", async ({ page }) => {
  for (const path of ["/assessment", "/enforcement", "/revenue", "/intelligence"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { name: /PTAS Officer Sign In/i })).toBeVisible();

    for (const retiredIdentity of retiredPilotIdentities) {
      await expect(page.getByText(retiredIdentity, { exact: false })).toHaveCount(0);
    }
  }
});

test("credential sign-in contains no embedded users or passwords", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(page.getByLabel(/Email address/i)).toHaveValue("");
  await expect(page.locator('input[type="password"]')).toHaveValue("");
  for (const retiredIdentity of retiredPilotIdentities) {
    await expect(page.getByText(retiredIdentity, { exact: false })).toHaveCount(0);
  }

  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await expect(page.locator("#sign-in-error")).toContainText(/valid email address/i);
});

test("expired password setup links fail closed with a fresh-link instruction", async ({ page }) => {
  await page.goto(
    "/account/update-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"
  );

  await expect(page.getByRole("heading", { name: /Set PTAS password/i })).toBeVisible();
  await expect(page.getByText(/expired or was already used/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Save password/i })).toBeDisabled();
  await expect(page.getByRole("link", { name: /Return to sign in/i })).toBeVisible();
});
