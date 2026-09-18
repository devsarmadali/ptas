import { expect, test } from "@playwright/test";

test("shows the non-production readiness state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Engineering preview" })).toBeVisible();
  await expect(page.getByText("Not for production")).toBeVisible();
});
