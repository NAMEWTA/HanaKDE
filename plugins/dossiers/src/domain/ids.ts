import { randomUUID } from "node:crypto";

export type EntityIdKind = "lib" | "dos" | "typ" | "con" | "doc" | "op";

const STABLE_ID_PATTERN = /^(lib|dos|typ|con|doc|op)_[a-z0-9][a-z0-9_-]{7,63}$/;

export function isStableId(value: unknown, kind?: EntityIdKind): value is string {
  if (typeof value !== "string" || !STABLE_ID_PATTERN.test(value)) return false;
  return kind ? value.startsWith(`${kind}_`) : true;
}

export function createStableId(kind: EntityIdKind): string {
  return `${kind}_${randomUUID().replaceAll("-", "")}`;
}
