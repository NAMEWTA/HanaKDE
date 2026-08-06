import path from "node:path";
import type { KnowledgeWorkspaceSandbox } from "./workspace-fixture.ts";

export type KnowledgeLaunchConfig = {
  env: NodeJS.ProcessEnv;
  host: "127.0.0.1";
  requestedPort: 0;
  workspaceRoot: string;
  electronArgs: string[];
};

const PASSTHROUGH_ENV_KEYS = [
  "PATH",
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "LD_LIBRARY_PATH",
  "DYLD_LIBRARY_PATH",
  "DISPLAY",
  "WAYLAND_DISPLAY",
  "XAUTHORITY",
  "DBUS_SESSION_BUS_ADDRESS",
] as const;

function selectedProcessEnvironment(
  sourceEnv: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    PASSTHROUGH_ENV_KEYS.flatMap((key) => {
      const value = sourceEnv[key];
      return value === undefined ? [] : [[key, value]];
    }),
  );
}

export function createKnowledgeLaunchConfig(
  workspace: KnowledgeWorkspaceSandbox,
  sourceEnv: NodeJS.ProcessEnv = process.env,
  productRoot: string = process.cwd(),
  platform: NodeJS.Platform = process.platform,
): KnowledgeLaunchConfig {
  const parsedHome = path.parse(workspace.userHome);
  const relativeHome = workspace.userHome.slice(parsedHome.root.length);
  const homePath = relativeHome.startsWith(path.sep)
    ? relativeHome
    : `${path.sep}${relativeHome}`;
  return {
    host: "127.0.0.1",
    requestedPort: 0,
    workspaceRoot: workspace.mainSource,
    electronArgs: [
      `--user-data-dir=${workspace.electronUserData}`,
      // Playwright starts Electron without an attached Windows console. This
      // fixture-only Electron switch avoids Node's stdio initialization path
      // when the hosted worker has no usable NUL device; it must be present
      // before Electron loads the application entrypoint.
      ...(platform === "win32" ? ["--no-stdio-init"] : []),
    ],
    env: {
      ...selectedProcessEnvironment(sourceEnv),
      HOME: workspace.userHome,
      USERPROFILE: workspace.userHome,
      HOMEDRIVE: parsedHome.root,
      HOMEPATH: homePath,
      USER: "hana-knowledge-e2e",
      USERNAME: "hana-knowledge-e2e",
      XDG_CONFIG_HOME: workspace.configHome,
      APPDATA: workspace.appData,
      LOCALAPPDATA: workspace.localAppData,
      TMPDIR: workspace.tempDir,
      TEMP: workspace.tempDir,
      TMP: workspace.tempDir,
      HANA_HOME: workspace.hanaHome,
      HANA_ROOT: path.resolve(productRoot),
      HANA_PORT: "0",
      HANA_CREATE_STARTUP_SESSION: "0",
      HANA_KNOWLEDGE_E2E: "1",
    },
  };
}
