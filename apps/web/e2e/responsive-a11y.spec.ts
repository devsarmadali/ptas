import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 375, height: 812 }
] as const;

const ACCESSIBLE_ROUTES = [
  "/sign-in",
  "/account/update-password",
  "/verify",
  "/verify/PTAS-TEST-123",
  "/documents/pf2/new",
  "/documents/pft1",
  "/documents/land-revenue-recovery",
  "/admin/user-management",
  "/intelligence/reports/view",
  "/intelligence/statutory-category-yield",
  "/units/test-unit/details"
] as const;

const SKIP_LINK_ROUTES = [
  "/sign-in",
  "/account/update-password",
  "/verify",
  "/verify/PTAS-TEST-123"
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`Responsive layout & semantic landmarks (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of ACCESSIBLE_ROUTES) {
      test(`${route} renders main, h1, and zero horizontal overflow at ${viewport.width}px`, async ({
        page
      }) => {
        await page.goto(route, { waitUntil: "domcontentloaded" });

        const main = page.locator("main#main-content");
        await expect(main).toBeVisible();

        const headings = page.locator("h1");
        await expect(headings).toHaveCount(1);
        await expect(headings.first()).toBeVisible();

        if ((SKIP_LINK_ROUTES as readonly string[]).includes(route)) {
          const skipLink = page.locator("a.skip-link");
          await expect(skipLink).toHaveAttribute("href", "#main-content");
        }

        const overflowMetrics = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth
        }));
        expect(overflowMetrics.scrollWidth).toBeLessThanOrEqual(overflowMetrics.innerWidth);
      });
    }
  });
}

test("/sign-in toggles password visibility accessibly", async ({ page }) => {
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });

  const passwordInput = page.getByLabel(/^Password$/i);
  await expect(passwordInput).toBeVisible();
  await expect(passwordInput).toHaveAttribute("type", "password");

  const toggleButton = page.getByRole("button", { name: /show password/i });
  await expect(toggleButton).toBeVisible();
  await toggleButton.click();

  await expect(passwordInput).toHaveAttribute("type", "text");
  const hideButton = page.getByRole("button", { name: /hide password/i });
  await expect(hideButton).toBeVisible();
  await hideButton.click();
  await expect(passwordInput).toHaveAttribute("type", "password");
});

test("/verify binds search label and renders lookup feedback region", async ({ page }) => {
  await page.goto("/verify", { waitUntil: "domcontentloaded" });

  const searchInput = page.locator("#verify-query-input");
  await expect(searchInput).toBeVisible();

  const linkedLabel = page.locator('label[for="verify-query-input"]');
  await expect(linkedLabel).toHaveCount(1);
  await linkedLabel.click();
  await expect(searchInput).toBeFocused();

  await searchInput.fill("PTAS-TEST-NONEXISTENT-9999");
  await page.locator('button[type="submit"]').click();

  const statusOrAlert = page.locator('[role="alert"], [role="status"], .alert, .alert-danger');
  await expect(statusOrAlert.first()).toBeVisible();
});

test("public routes load with valid favicon and zero 404/console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedAssets: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() >= 400) failedAssets.push(`${res.status()} ${res.url()}`);
  });

  for (const route of ["/sign-in", "/verify", "/intelligence/reports/view"]) {
    await page.goto(route, { waitUntil: "networkidle" });
  }

  const faviconRes = await page.request.get("/favicon.ico");
  expect(faviconRes.status()).toBe(200);
  expect(failedAssets).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
