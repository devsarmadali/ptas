import { defineConfig } from "@playwright/test";

const baseURL = process.env.PTAS_E2E_BASE_URL ?? "http://127.0.0.1:3100";
const port = new URL(baseURL).port || "3100";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL },
  webServer: {
    command: process.platform === "win32" ? `pnpm.cmd start -p ${port}` : `pnpm start -p ${port}`,
    url: baseURL,
    reuseExistingServer: Boolean(process.env.PTAS_E2E_BASE_URL) && !process.env.CI
  }
});
