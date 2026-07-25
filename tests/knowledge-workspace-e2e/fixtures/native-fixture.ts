import { randomUUID } from "node:crypto";
import type { ElectronApplication } from "@playwright/test";

export type NativeDialogStub = {
  openPaths?: string[];
  savePath?: string;
  canceled?: boolean;
};

export type NativeDialogStubDisposer = () => Promise<void>;

export async function installNativeDialogStub(
  electronApplication: ElectronApplication,
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
