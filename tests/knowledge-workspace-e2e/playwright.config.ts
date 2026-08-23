import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  outputDir: "./artifacts",
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // A release gate reports its first-run behavior. A retry must never turn a
  // platform regression into a passing Knowledge Workspace result.
  retries: 0,
  workers: 1,
  expect: {
    timeout: 15_000,
  },
  // Workspace fixtures intentionally exercise hostile filenames, link swaps,
  // and sentinel content. Playwright traces, page snapshots and screenshots
  // can retain that data (and error context includes test source), so CI only
  // publishes the sanitized status assertions written by the reporter.
  preserveOutput: "never",
  reporter: [["list"]],
  use: {
    trace: "off",
    screenshot: "off",
    video: "off",
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
