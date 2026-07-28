import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  outputDir: "./artifacts",
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-full",
      metadata: { knowledgeRuntime: "desktop-full" },
    },
    {
      name: "web-open",
      metadata: { knowledgeRuntime: "web-open" },
    },
    {
      name: "web-full",
      metadata: { knowledgeRuntime: "web-full" },
    },
  ],
});
