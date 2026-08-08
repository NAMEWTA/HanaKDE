import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "js-yaml";
import { upsertStudioMount } from "../../../core/studio-mounts.ts";
import {
  ensureLocalIdentityRegistries,
  loadServerIdentity,
} from "../../../core/server-identity.ts";

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
    ensureLocalIdentityRegistries(hanaHome);
    const { studioId } = loadServerIdentity(hanaHome);
    for (const [index, root] of mountedSources.entries()) {
      upsertStudioMount(hanaHome, {
        mountId: `knowledge_e2e_mount_${index + 1}`,
        hostStudioId: studioId,
        sourceKind: "storage",
        provider: "local_fs",
        rootLocator: { path: root },
        label: `Knowledge E2E mount ${index + 1}`,
        presentation: "folder",
        capabilities: [
          "list",
          "read",
          "write",
          "watch",
          "materialize",
        ],
      });
    }
    for (const [mountId, root, label] of [
      ["knowledge_e2e_mount_same", mainSource, "Knowledge E2E same root"],
      ["knowledge_e2e_mount_ancestor", rootDir, "Knowledge E2E ancestor root"],
    ] as const) {
      upsertStudioMount(hanaHome, {
        mountId,
        hostStudioId: studioId,
        sourceKind: "storage",
        provider: "local_fs",
        rootLocator: { path: root },
        label,
        presentation: "folder",
        capabilities: ["list", "read", "write", "watch", "materialize"],
      });
    }
    await seedPrimaryAgent({
      hanaHome,
      mainSource,
      productRoot: process.cwd(),
    });

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

async function seedPrimaryAgent({
  hanaHome,
  mainSource,
  productRoot,
}: {
  hanaHome: string;
  mainSource: string;
  productRoot: string;
}): Promise<void> {
  const agentDir = path.join(hanaHome, "agents", "hanako");
  await Promise.all([
    fs.mkdir(path.join(agentDir, "memory"), { recursive: true }),
    fs.mkdir(path.join(agentDir, "sessions"), { recursive: true }),
    fs.mkdir(path.join(agentDir, "avatars"), { recursive: true }),
    fs.mkdir(path.join(agentDir, "desk"), { recursive: true }),
    fs.mkdir(path.join(hanaHome, "user"), { recursive: true }),
  ]);
  const template = YAML.load(
    await fs.readFile(
      path.join(productRoot, "lib", "config.example.yaml"),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const desk = (
    template.desk
    && typeof template.desk === "object"
    && !Array.isArray(template.desk)
  )
    ? template.desk as Record<string, unknown>
    : {};
  template.desk = {
    ...desk,
    home_folder: mainSource,
    heartbeat_enabled: false,
  };
  await fs.writeFile(
    path.join(agentDir, "config.yaml"),
    YAML.dump(template, {
      indent: 2,
      lineWidth: -1,
      sortKeys: false,
      quotingType: '"',
    }),
    "utf8",
  );
  await fs.writeFile(
    path.join(hanaHome, "user", "preferences.json"),
    `${JSON.stringify({
      primaryAgent: "hanako",
      locale: "en",
      setupComplete: true,
    }, null, 2)}\n`,
    "utf8",
  );
}
