import {
  expect,
  test as base,
  type ElectronApplication,
} from "@playwright/test";
import {
  createKnowledgeLaunchConfig,
  type KnowledgeLaunchConfig,
} from "./server-fixture.ts";
import {
  installNativeDialogStub,
  type NativeDialogStub,
  type NativeDialogStubDisposer,
} from "./native-fixture.ts";
import {
  createKnowledgeWorkspaceSandbox,
  type KnowledgeWorkspaceSandbox,
} from "./workspace-fixture.ts";

type KnowledgeFixtures = {
  workspaceSandbox: KnowledgeWorkspaceSandbox;
  launchConfig: KnowledgeLaunchConfig;
  installDialogStub(
    electronApplication: ElectronApplication,
    stub: NativeDialogStub,
  ): Promise<NativeDialogStubDisposer>;
};

export const test = base.extend<KnowledgeFixtures>({
  workspaceSandbox: async (_fixtures, use, testInfo) => {
    const sandbox = await createKnowledgeWorkspaceSandbox(testInfo.workerIndex);
    try {
      await use(sandbox);
    } finally {
      await sandbox.dispose();
    }
  },
  launchConfig: async ({ workspaceSandbox }, use) => {
    await use(createKnowledgeLaunchConfig(workspaceSandbox));
  },
  installDialogStub: async (_fixtures, use) => {
    const disposers: NativeDialogStubDisposer[] = [];
    let useError: unknown;
    try {
      await use(async (electronApplication, stub) => {
        const dispose = await installNativeDialogStub(electronApplication, stub);
        disposers.push(dispose);
        return dispose;
      });
    } catch (error) {
      useError = error;
    }
    const restoreErrors: unknown[] = [];
    for (const dispose of disposers.reverse()) {
      try {
        await dispose();
      } catch (error) {
        restoreErrors.push(error);
      }
    }
    if (useError && restoreErrors.length === 0) throw useError;
    if (useError || restoreErrors.length > 0) {
      throw new AggregateError(
        useError ? [useError, ...restoreErrors] : restoreErrors,
        "knowledge dialog fixture or restoration failed",
      );
    }
  },
});

export { expect };
