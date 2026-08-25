import fs from "node:fs";
import path from "node:path";
import { FinanceError, SCHEMA_VERSION, nowIso } from "./contracts.js";

const EMPTY = {
  schemaVersion: SCHEMA_VERSION,
  revision: 0,
  sourcePolicies: [],
  providerProbes: [],
  watchlists: [{ id: "default", name: "自选", assetIds: [], version: 1 }],
  researchPools: [{ id: "research", name: "研究池", assetIds: [], version: 1 }],
  ledgerEvents: [],
  privateMaterials: [],
  strategies: [],
  backtests: [],
  monitors: [],
  tasks: [],
  consents: [],
  researchRuns: [],
  audit: [],
};

export class FinanceStore {
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
    this.file = path.join(this.dataDir, "finance-workbench.v1.json");
    this.backup = `${this.file}.bak`;
    this.state = this.load();
  }

  load() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (!fs.existsSync(this.file)) return structuredClone(EMPTY);
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (parsed.schemaVersion !== SCHEMA_VERSION) throw new FinanceError("schema_mismatch", "Unknown finance store schema", { details: { found: parsed.schemaVersion } });
      const unknownFields = Object.keys(parsed).filter((key) => !(key in EMPTY));
      if (unknownFields.length) throw new FinanceError("schema_mismatch", "Finance store contains unknown top-level fields and was isolated", { details: { unknownFields } });
      return { ...structuredClone(EMPTY), ...parsed };
    } catch (error) {
      if (error instanceof FinanceError) throw error;
      throw new FinanceError("store_corrupt", "Finance store is unreadable; the original file was not modified", { details: { file: path.basename(this.file) } });
    }
  }

  snapshot() {
    return structuredClone(this.state);
  }

  mutate(action, actor, fn) {
    const draft = structuredClone(this.state);
    const result = fn(draft);
    draft.revision += 1;
    draft.audit.push({ id: `audit_${draft.revision}`, at: nowIso(), action, actor: actor ?? "user", result: summarize(result) });
    if (draft.audit.length > 1000) draft.audit.splice(0, draft.audit.length - 1000);
    this.persist(draft);
    this.state = draft;
    return result;
  }

  persist(next) {
    const temp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.backup);
    fs.renameSync(temp, this.file);
  }
}

function summarize(value) {
  if (!value || typeof value !== "object") return value ?? null;
  const record = Array.isArray(value) ? { count: value.length } : value;
  return {
    id: typeof record.id === "string" ? record.id : undefined,
    status: typeof record.status === "string" ? record.status : undefined,
    count: typeof record.count === "number" ? record.count : undefined,
  };
}
