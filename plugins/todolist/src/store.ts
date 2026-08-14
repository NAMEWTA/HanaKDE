import fs from "node:fs";
import path from "node:path";
import { TodoError } from "./errors.ts";
import type { StoreState } from "./types.ts";

export const STORE_SCHEMA_VERSION = 1;

function emptyState(): StoreState {
  return { schemaVersion: STORE_SCHEMA_VERSION, storeVersion: 0, todos: [], projects: [], audit: [], confirmations: [], recurrenceRules: [], occurrences: [], reminders: [], runs: [], attempts: [], runtime: { readiness: "initializing", readinessAttempts: 0, lastError: null }, exchangeAudit: [] };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class TodoStore {
  readonly filePath: string;
  private state: StoreState;
  private failNextCommit = false;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "store.v1.json");
    this.state = this.read(dataDir);
  }

  private read(dataDir: string): StoreState {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      if (!fs.existsSync(this.filePath)) return emptyState();
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      if (parsed?.schemaVersion !== STORE_SCHEMA_VERSION || !Array.isArray(parsed.todos)) {
        throw new TodoError("storage_failure", "Todo store schema is unsupported");
      }
      return {
        schemaVersion: STORE_SCHEMA_VERSION,
        storeVersion: Number.isInteger(parsed.storeVersion) ? parsed.storeVersion : 0,
        todos: parsed.todos.map((todo: any) => ({ priority: "normal", agentId: null, instructions: null, permissionMode: null, workspaceRef: null, ...todo })),
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        audit: Array.isArray(parsed.audit) ? parsed.audit : [],
        confirmations: Array.isArray(parsed.confirmations) ? parsed.confirmations : [],
        recurrenceRules: Array.isArray(parsed.recurrenceRules) ? parsed.recurrenceRules.map((rule: any) => ({ ...rule, status: rule.status || "active" })) : [],
        occurrences: Array.isArray(parsed.occurrences) ? parsed.occurrences : [],
        reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
        runs: Array.isArray(parsed.runs) ? parsed.runs : [],
        attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
        runtime: parsed.runtime && typeof parsed.runtime === "object" ? parsed.runtime : { readiness: "initializing", readinessAttempts: 0, lastError: null },
        exchangeAudit: Array.isArray(parsed.exchangeAudit) ? parsed.exchangeAudit : [],
      };
    } catch (error) {
      if (error instanceof TodoError) throw error;
      throw new TodoError("storage_failure", "Todo store cannot be opened");
    }
  }

  snapshot(): StoreState {
    return clone(this.state);
  }

  injectCommitFailure(): void {
    this.failNextCommit = true;
  }

  transact<T>(mutator: (draft: StoreState) => T): T {
    const draft = clone(this.state);
    try {
      const result = mutator(draft);
      draft.storeVersion += 1;
      if (this.failNextCommit) {
        this.failNextCommit = false;
        throw new Error("injected commit failure");
      }
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(draft, null, 2), { mode: 0o600 });
      fs.renameSync(tempPath, this.filePath);
      this.state = draft;
      return result;
    } catch (error) {
      try {
        const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
      if (error instanceof TodoError) throw error;
      throw new TodoError("transaction_failed", "Todo change was rolled back");
    }
  }
}
