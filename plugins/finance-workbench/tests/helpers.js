import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function tempDir(label = "test") {
  return fs.mkdtempSync(path.join(os.tmpdir(), `hana-finance-${label}-`));
}

export function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

export class FakeBus {
  constructor(options = {}) {
    this.options = options;
    this.requests = [];
    this.handlers = new Map();
    this.schedules = new Map();
  }

  handle(type, handler) {
    this.handlers.set(type, handler);
    return () => this.handlers.delete(type);
  }

  async request(type, payload, options) {
    this.requests.push({ type, payload, options });
    if (type === "task:register-handler") {
      if (this.options.failRegister) throw new Error("No handler registered");
      this.handlers.set(payload.type, payload);
      return { ok: true };
    }
    if (type === "task:unregister-handler") {
      this.handlers.delete(payload.type);
      return { ok: true };
    }
    if (type === "task:schedule") {
      if (this.options.failSchedule) throw new Error("scheduler offline");
      this.schedules.set(payload.scheduleId, payload);
      return { ok: true };
    }
    if (type === "task:unschedule") {
      if (this.options.failUnschedule) throw new Error("unschedule rejected");
      const removed = this.schedules.delete(payload.scheduleId);
      return { ok: true, removed: this.options.unscheduleRemoved ?? removed };
    }
    throw new Error(`No handler registered for ${type}`);
  }
}

export function makeContext(dir, options = {}) {
  const bus = options.bus ?? new FakeBus();
  const config = new Map(Object.entries(options.config ?? {}));
  const stat = options.stat ?? (async (ref) => ({ resourceKey: `${ref.kind}:opaque`, resource: ref, exists: true, isDirectory: false, version: { sha256: "fixture-content-hash" } }));
  return {
    pluginId: "finance-workbench",
    dataDir: dir,
    bus,
    config: { get: (key) => config.get(key) },
    network: options.network,
    resources: { stat },
    log: { info() {}, warn() {}, error() {} },
    sessionId: "session-test",
    sessionRef: { sessionId: "session-test" },
    stageFile: options.stageFile ?? ((input) => ({ type: "session_file", fileId: "sf_test", label: input.label, size: 12, mime: "application/json" })),
  };
}
