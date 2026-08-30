import { defineConfig } from "@playwright/test";

const pageUrl = process.env.HANA_DOSSIERS_E2E_URL;
if (!pageUrl) throw new Error("HANA_DOSSIERS_E2E_URL must point to the real loaded dossiers Page; substitute servers are unsupported.");

export default defineConfig({
  testDir: ".",
  testMatch: "real-host.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: pageUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "narrow", use: { viewport: { width: 390, height: 844 } } }
  ]
});
