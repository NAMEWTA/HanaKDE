import { randomUUID } from "node:crypto";
import type { ElectronMainProcessApplication } from "./electron-main-process-application.ts";

export type NativeDialogStub = {
  openPaths?: string[];
  savePath?: string;
  canceled?: boolean;
};

export type NativeDialogStubDisposer = () => Promise<void>;

export async function installNativeDialogStub(
  electronApplication: ElectronMainProcessApplication,
  stub: NativeDialogStub,
): Promise<NativeDialogStubDisposer> {
  const restoreKey = `__hanaKnowledgeDialogRestore_${randomUUID()}`;
  await electronApplication.evaluate(
    ({ dialog }, configuration) => {
      type DialogRestore = Pick<
        typeof dialog,
        "showOpenDialog" | "showSaveDialog"
      >;
      const scope = globalThis as typeof globalThis & Record<string, unknown>;
      scope[configuration.restoreKey] = {
        showOpenDialog: dialog.showOpenDialog,
        showSaveDialog: dialog.showSaveDialog,
      } satisfies DialogRestore;
      const configuredStub = configuration.stub;
      const canceled = configuredStub.canceled ?? false;
      dialog.showOpenDialog = async () => ({
        canceled,
        filePaths: configuredStub.openPaths ?? [],
      });
      dialog.showSaveDialog = async () => ({
        canceled,
        filePath: configuredStub.savePath ?? "",
      });
    },
    { restoreKey, stub },
  );

  let disposed = false;
  return async () => {
    if (disposed) return;
    // Windows desktop scenarios are process-isolated and the owning fixture
    // terminates the complete Electron tree immediately after test teardown.
    // Restoring a main-process method over Playwright IPC at that point is
    // unnecessary and can remain pending while the process is already
    // exiting. Other platforms retain the explicit restoration below.
    if (process.platform === "win32") {
      disposed = true;
      return;
    }
    await electronApplication.evaluate(
      ({ dialog }, key) => {
        type DialogRestore = Pick<
          typeof dialog,
          "showOpenDialog" | "showSaveDialog"
        >;
        const scope = globalThis as typeof globalThis & Record<string, unknown>;
        const restore = scope[key] as DialogRestore | undefined;
        if (!restore) return;
        dialog.showOpenDialog = restore.showOpenDialog;
        dialog.showSaveDialog = restore.showSaveDialog;
        delete scope[key];
      },
      restoreKey,
    );
    disposed = true;
  };
}
