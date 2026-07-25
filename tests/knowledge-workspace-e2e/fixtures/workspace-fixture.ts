import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type KnowledgeWorkspaceSandbox = {
  rootDir: string;
  userHome: string;
  configHome: string;
  appData: string;
  localAppData: string;
  tempDir: string;
  electronUserData: string;
  hanaHome: string;
  mainSource: string;
  mountedSources: [string, string];
  dispose(): Promise<void>;
};

export async function createKnowledgeWorkspaceSandbox(
  workerIndex: number,
): Promise<KnowledgeWorkspaceSandbox> {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), `hana-knowledge-e2e-w${workerIndex}-`),
  );
  try {
    const userHome = path.join(rootDir, "user-home");
    const configHome = path.join(rootDir, "xdg-config");
    const appData = path.join(rootDir, "app-data");
    const localAppData = path.join(rootDir, "local-app-data");
    const tempDir = path.join(rootDir, "tmp");
    const electronUserData = path.join(rootDir, "electron-user-data");
    const hanaHome = path.join(rootDir, "hana-home");
    const mainSource = path.join(rootDir, "main");
    const mountedSources: [string, string] = [
      path.join(rootDir, "mounted-a"),
      path.join(rootDir, "mounted-b"),
    ];

    await Promise.all(
      [
        userHome,
        configHome,
        appData,
        localAppData,
        tempDir,
        electronUserData,
        hanaHome,
        mainSource,
        ...mountedSources,
      ].map((directory) => fs.mkdir(directory, { recursive: true })),
    );

    return {
      rootDir,
      userHome,
      configHome,
      appData,
      localAppData,
      tempDir,
      electronUserData,
      hanaHome,
      mainSource,
      mountedSources,
      async dispose() {
        await fs.rm(rootDir, {
          recursive: true,
          force: true,
          maxRetries: 20,
          retryDelay: 250,
        });
      },
    };
  } catch (error) {
    await fs.rm(rootDir, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 250,
    });
    throw error;
  }
}
