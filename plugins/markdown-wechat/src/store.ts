import fs from "node:fs";
import path from "node:path";
import { PRIVATE_SCHEMA_VERSION, type FontId, type PrivateEnvelope, type StoreLoadResult, type ThemeId } from "./contracts.ts";

const STATE_FILE = "active-document.v1.json";
const THEMES = new Set<ThemeId>(["editorial", "jade", "signal"]);
const FONTS = new Set<FontId>(["sans", "serif", "mono"]);

export class PrivateStoreError extends Error {
  readonly code: "conflict" | "invalid" | "write_failed" | "recovery_locked";

  constructor(code: "conflict" | "invalid" | "write_failed" | "recovery_locked", message: string) {
    super(message);
    this.name = "PrivateStoreError";
    this.code = code;
  }
}

export function defaultEnvelope(now = new Date()): PrivateEnvelope {
  const iso = now.toISOString();
  return {
    schemaVersion: PRIVATE_SCHEMA_VERSION,
    revision: 0,
    markdown: "# Untitled\n\nStart writing your article here.",
    title: "Untitled",
    settings: { theme: "editorial", font: "sans", fontSize: 16 },
    dirty: false,
    createdAt: iso,
    updatedAt: iso,
    savedAt: null,
  };
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeTitle(value: unknown): string {
  const title = text(value).trim().replace(/[\r\n\t]+/g, " ").slice(0, 160);
  return title || "Untitled";
}

function normalizeSettings(value: unknown): PrivateEnvelope["settings"] {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const theme = THEMES.has(record.theme as ThemeId) ? record.theme as ThemeId : "editorial";
  const font = FONTS.has(record.font as FontId) ? record.font as FontId : "sans";
  const fontSize = Number(record.fontSize);
  return {
    theme,
    font,
    fontSize: Number.isFinite(fontSize) ? Math.max(13, Math.min(22, Math.round(fontSize))) : 16,
  };
}

export function validateEnvelope(value: unknown): PrivateEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PrivateStoreError("invalid", "Private document must be an object");
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== PRIVATE_SCHEMA_VERSION) {
    throw new PrivateStoreError("invalid", `Unsupported private document schema ${String(record.schemaVersion)}`);
  }
  const revision = Number(record.revision);
  if (!Number.isInteger(revision) || revision < 0) {
    throw new PrivateStoreError("invalid", "Private document revision must be a non-negative integer");
  }
  if (typeof record.markdown !== "string" || record.markdown.length > 2_000_000) {
    throw new PrivateStoreError("invalid", "Markdown must be a string no larger than 2 MB");
  }
  const fallbackTime = new Date(0).toISOString();
  return {
    schemaVersion: PRIVATE_SCHEMA_VERSION,
    revision,
    markdown: record.markdown,
    title: normalizeTitle(record.title),
    settings: normalizeSettings(record.settings),
    dirty: record.dirty === true,
    createdAt: text(record.createdAt, fallbackTime),
    updatedAt: text(record.updatedAt, fallbackTime),
    savedAt: typeof record.savedAt === "string" ? record.savedAt : null,
  };
}

export class PrivateDocumentStore {
  readonly filePath: string;
  readonly dataDir: string;
  private current: PrivateEnvelope;
  private recovery: StoreLoadResult["recovery"] = null;
  private readonly clock: () => Date;

  constructor(dataDir: string, clock: () => Date = () => new Date()) {
    this.dataDir = dataDir;
    this.clock = clock;
    this.filePath = path.join(dataDir, STATE_FILE);
    this.current = defaultEnvelope(clock());
    this.readFromDisk();
  }

  load(): StoreLoadResult {
    return { state: structuredClone(this.current), recovery: this.recovery ? { ...this.recovery } : null };
  }

  save(input: {
    markdown: unknown;
    title?: unknown;
    settings?: unknown;
    dirty?: unknown;
    expectedRevision?: unknown;
  }): PrivateEnvelope {
    if (this.recovery) {
      throw new PrivateStoreError("recovery_locked", "The original private document is locked until recovery is explicitly reset");
    }
    const expectedRevision = Number(input.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== this.current.revision) {
      throw new PrivateStoreError(
        "conflict",
        `Private document changed (expected revision ${String(input.expectedRevision)}, current ${this.current.revision})`,
      );
    }
    if (typeof input.markdown !== "string" || input.markdown.length > 2_000_000) {
      throw new PrivateStoreError("invalid", "Markdown must be a string no larger than 2 MB");
    }
    const now = this.clock().toISOString();
    const next: PrivateEnvelope = {
      ...this.current,
      revision: this.current.revision + 1,
      markdown: input.markdown,
      title: normalizeTitle(input.title ?? inferTitle(input.markdown)),
      settings: normalizeSettings(input.settings ?? this.current.settings),
      dirty: input.dirty !== false,
      updatedAt: now,
      savedAt: now,
    };
    this.writeAtomic(next);
    this.current = next;
    this.recovery = null;
    return structuredClone(next);
  }

  resetAfterRecovery(): { state: PrivateEnvelope; backupName: string | null } {
    if (!this.recovery) return { state: structuredClone(this.current), backupName: null };
    fs.mkdirSync(this.dataDir, { recursive: true });
    let backupName: string | null = null;
    if (fs.existsSync(this.filePath)) {
      backupName = `${STATE_FILE}.recovery-${Date.now()}.bak`;
      fs.copyFileSync(this.filePath, path.join(this.dataDir, backupName), fs.constants.COPYFILE_EXCL);
    }
    const next = defaultEnvelope(this.clock());
    this.writeAtomic(next);
    this.current = next;
    this.recovery = null;
    return { state: structuredClone(next), backupName };
  }

  private readFromDisk(): void {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as unknown;
      const schema = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).schemaVersion : null;
      if (schema !== PRIVATE_SCHEMA_VERSION) {
        this.recovery = { code: "unsupported", message: `Unsupported private document schema ${String(schema)}` };
        return;
      }
      this.current = validateEnvelope(parsed);
    } catch (error) {
      this.recovery = {
        code: error instanceof SyntaxError || error instanceof PrivateStoreError ? "corrupt" : "read_failed",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private writeAtomic(value: PrivateEnvelope): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      fs.renameSync(temporary, this.filePath);
    } catch (error) {
      try { fs.unlinkSync(temporary); } catch {}
      throw new PrivateStoreError("write_failed", error instanceof Error ? error.message : String(error));
    }
  }
}

export function inferTitle(markdown: string): string {
  const heading = markdown.match(/^\s{0,3}#{1,6}\s+(.+)$/m)?.[1];
  if (heading) return normalizeTitle(heading.replace(/[*_~`[\]]/g, ""));
  const first = markdown.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return normalizeTitle(first ?? "Untitled");
}
