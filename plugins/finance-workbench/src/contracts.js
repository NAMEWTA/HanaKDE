import crypto from "node:crypto";

export const SCHEMA_VERSION = 1;
export const CAPABILITY_STATES = ["supported", "partial", "experimental", "unavailable", "blocked"];
export const TASK_STATES = ["queued", "running", "paused", "cancel_requested", "cancelled", "completed", "failed", "recoverable"];
export const MARKETS = ["A", "HK"];
export const DATASETS = ["identity", "quote", "daily_kline", "minute_kline", "financials", "filings", "research", "news"];
export const MODULES = ["overview", "sources", "assets", "quotes", "research", "portfolio", "quant", "backtest", "automation", "agent", "exchange", "diagnostics"];

export class FinanceError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "FinanceError";
    this.code = code;
    this.retryable = options.retryable === true;
    this.status = options.status ?? 400;
    this.scope = options.scope ?? "request";
    this.alternative = options.alternative ?? null;
    this.details = options.details ?? null;
  }
}

export function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function envelope(payload, requestId = id("req")) {
  return { ok: true, schemaVersion: SCHEMA_VERSION, requestId, generatedAt: nowIso(), ...payload };
}

export function errorEnvelope(error, requestId = id("req")) {
  const known = error instanceof FinanceError ? error : new FinanceError("internal_error", "Finance Workbench could not complete the request", { status: 500 });
  return {
    ok: false,
    schemaVersion: SCHEMA_VERSION,
    requestId,
    error: {
      code: known.code,
      message: publicText(known.message),
      retryable: known.retryable,
      scope: known.scope,
      alternative: known.alternative,
      details: sanitizePublic(known.details),
    },
  };
}

export function assertEnum(value, allowed, field) {
  if (!allowed.includes(value)) throw new FinanceError("invalid_request", `${field} must be one of ${allowed.join(", ")}`, { details: { field } });
  return value;
}

export function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new FinanceError("invalid_request", `${field} is required`, { details: { field } });
  return value.trim();
}

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/api[-_]?key|token|secret|password|authorization|credential|privateBody|rawPrompt/i.test(key)) output[key] = "[REDACTED]";
    else output[key] = redact(item);
  }
  return output;
}

export function financeErrorFrom(error) {
  if (error instanceof FinanceError) return error;
  return new FinanceError("internal_error", "Finance Workbench could not complete the request", { status: 500 });
}

function publicText(value) {
  const text = String(value ?? "");
  if (/(?:^|\s)(?:\/[\w.-]+){2,}|[A-Za-z]:\\|(?:token|secret|password|api[_-]?key)=/i.test(text)) return "Sensitive runtime details were redacted";
  return text;
}

function sanitizePublic(value, key = "") {
  if (value === null || value === undefined) return value;
  if (/path|resourceRef|token|secret|password|authorization|credential|api[-_]?key/i.test(key)) return "[REDACTED]";
  if (typeof value === "string") return publicText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizePublic(item));
  if (typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([nestedKey, item]) => [nestedKey, sanitizePublic(item, nestedKey)]));
}
