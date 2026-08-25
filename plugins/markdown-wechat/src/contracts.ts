export const PRIVATE_SCHEMA_VERSION = 1 as const;

export type ThemeId = "editorial" | "jade" | "signal";
export type FontId = "sans" | "serif" | "mono";

export interface ArticleSettings {
  theme: ThemeId;
  font: FontId;
  fontSize: number;
}

export interface PrivateEnvelope {
  schemaVersion: typeof PRIVATE_SCHEMA_VERSION;
  revision: number;
  markdown: string;
  title: string;
  settings: ArticleSettings;
  dirty: boolean;
  createdAt: string;
  updatedAt: string;
  savedAt: string | null;
}

export interface StoreLoadResult {
  state: PrivateEnvelope;
  recovery: null | {
    code: "corrupt" | "unsupported" | "read_failed";
    message: string;
  };
}

export interface PluginResourceReadResult {
  content: string | Uint8Array | ArrayBuffer | { type?: string; data?: number[] };
  version?: unknown;
  ref?: unknown;
  mime?: string;
  name?: string;
}

export interface PluginResourcesLike {
  stat(ref: Record<string, unknown>): Promise<Record<string, unknown>>;
  read(ref: Record<string, unknown>): Promise<PluginResourceReadResult>;
  writeExpectedVersion(
    ref: Record<string, unknown>,
    content: string,
    expectedVersion: unknown,
  ): Promise<Record<string, unknown>>;
}

export interface PluginContextLike {
  pluginId: string;
  dataDir: string;
  resources: PluginResourcesLike;
  sessionId?: string | null;
  sessionPath?: string | null;
  sessionRef?: Record<string, unknown> | null;
  stageFile?: (input: Record<string, unknown>) => Record<string, unknown>;
  log?: {
    debug?(...args: unknown[]): void;
    info?(...args: unknown[]): void;
    warn?(...args: unknown[]): void;
    error?(...args: unknown[]): void;
  };
}
