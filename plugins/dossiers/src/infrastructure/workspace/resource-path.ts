import type { HanaResourceRef } from "@hana/plugin-runtime";

export type WorkspaceTreeRef = Extract<HanaResourceRef, { kind: "mount" | "local-file" }>;

const DRIVE_PATH = /^[A-Za-z]:[\\/]/;

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

export function normalizeRelativePath(path: string): string {
  if (!path || containsControlCharacter(path) || path.startsWith("/") || path.startsWith("\\") || DRIVE_PATH.test(path)) {
    throw new Error("resource path must be a non-empty relative path");
  }
  const segments = path.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("resource path contains an unsafe segment");
  }
  return segments.join("/");
}

export function appendResourcePath(root: WorkspaceTreeRef, relativePath: string): WorkspaceTreeRef {
  const relative = normalizeRelativePath(relativePath);
  const base = root.path.replaceAll("\\", "/").replace(/\/$/, "");
  return { ...root, path: base ? `${base}/${relative}` : relative };
}
