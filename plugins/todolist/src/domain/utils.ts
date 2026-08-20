import { createHash, randomUUID } from "node:crypto";
import { TodoError } from "../errors.ts";

export const nowIso = (): string => new Date().toISOString();
export const newId = (prefix: string): string => `${prefix}_${randomUUID()}`;
export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
export const clone = <T>(value: T): T => structuredClone(value);
export const codePointLength = (value: string): number => Array.from(value).length;
export const normalizeSearch = (value: string): string => value.normalize("NFKC").toLocaleLowerCase();
export const uniqueStrings = (values: string[]): string[] => [...new Set(values)];

export function requireRecord(value: unknown, field = "input"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TodoError("validation", `${field} must be an object`, { field });
  }
  return value as Record<string, unknown>;
}

export function optionalString(value: unknown, field: string, max = 10_000): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new TodoError("validation", `${field} must be a string`, { field });
  if (codePointLength(value) > max) throw new TodoError("validation", `${field} is too long`, { field });
  return value;
}

export function requiredString(value: unknown, field: string, max = 10_000): string {
  const normalized = optionalString(value, field, max)?.trim();
  if (!normalized) throw new TodoError("validation", `${field} is required`, { field });
  return normalized;
}

export function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new TodoError("validation", `${field} must be boolean`, { field });
  return value;
}

export function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TodoError("validation", `${field} must be a finite number`, { field });
  return value;
}

export function enumValue<T extends string>(value: unknown, allowed: readonly T[], field: string, fallback?: T): T {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    throw new TodoError("validation", `${field} is required`, { field });
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new TodoError("validation", `${field} must be one of ${allowed.join(", ")}`, { field });
  }
  return value as T;
}

export function asStringArray(value: unknown, field: string, maxItems: number, itemMax: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new TodoError("validation", `${field} must be an array`, { field });
  if (value.length > maxItems) throw new TodoError("validation", `${field} has too many items`, { field });
  return uniqueStrings(value.map((item, index) => requiredString(item, `${field}[${index}]`, itemMax)));
}

export function stableJson(value: unknown): string {
  // Track only the active recursion path. Reusing the same object in two
  // independent branches is valid JSON input; only an ancestor cycle is not.
  const ancestors = new WeakSet<object>();
  const normalize = (input: unknown): unknown => {
    if (!input || typeof input !== "object") return input;
    const object = input as object;
    if (ancestors.has(object)) throw new TodoError("validation", "Cyclic input is not supported");
    ancestors.add(object);
    try {
      if (Array.isArray(input)) return input.map(normalize);
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, normalize(item)]),
      );
    } finally {
      ancestors.delete(object);
    }
  };
  return JSON.stringify(normalize(value));
}

export function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}
