import type { ChildProcess } from "node:child_process";
import type { ElectronApplication, Page } from "@playwright/test";

// The Windows Direct-CDP path intentionally implements only the main-process
// surface consumed by Knowledge workspace scenarios. Keeping the fixture type
// narrow prevents a transport adapter from claiming unsupported Playwright
// Electron lifecycle APIs.
export type ElectronMainProcessApplication = Pick<ElectronApplication, "evaluate"> & {
  process(): ChildProcess;
  windows(): Page[];
  waitForEvent(event: "window"): Promise<Page>;
};
