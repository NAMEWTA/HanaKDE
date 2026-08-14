import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  outputDir: "plugins/todolist/tests/e2e/test-results",
  reporter: [["line"], ["json", { outputFile: "plugins/todolist/tests/e2e/test-results/report.json" }]],
  use: {
    baseURL: "http://127.0.0.1:41739",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "node --experimental-strip-types server.ts",
    url: "http://127.0.0.1:41739/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
