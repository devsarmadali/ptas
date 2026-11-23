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
    await expect(page).toHaveURL(/\/sign-in(\?.*)?$/);
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

test("SSR routes issue strict per-request nonce CSP headers without inline/eval bypasses", async ({
  page
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const firstResponse = await page.goto("/sign-in");
  expect(firstResponse?.status()).toBe(200);
  const firstCsp = firstResponse?.headers()["content-security-policy"] ?? "";
  expect(firstCsp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(firstCsp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(firstCsp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  expect(firstCsp).toContain("object-src 'none'");

  const secondResponse = await page.goto("/verify");
  expect(secondResponse?.status()).toBe(200);
  const secondCsp = secondResponse?.headers()["content-security-policy"] ?? "";
  const firstNonce = firstCsp.match(/'nonce-([^']+)'/)?.[1];
  const secondNonce = secondCsp.match(/'nonce-([^']+)'/)?.[1];
  expect(firstNonce).toBeTruthy();
  expect(secondNonce).toBeTruthy();
  expect(firstNonce).not.toBe(secondNonce);
  expect(consoleErrors).toEqual([]);
});
