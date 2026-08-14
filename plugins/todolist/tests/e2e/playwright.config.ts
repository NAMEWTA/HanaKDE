import { defineConfig } from "@playwright/test";

const pageUrl = process.env.HANA_TODO_E2E_URL;
if (!pageUrl) {
  throw new Error("HANA_TODO_E2E_URL must point to the real loaded todolist Page; fake servers are intentionally unsupported.");
}

export default defineConfig({
  testDir: ".",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: pageUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "narrow", use: { viewport: { width: 390, height: 844 } } },
  ],
});
