import { createHash } from "node:crypto";

import { appendResourcePath, type WorkspaceTreeRef } from "../workspace/resource-path.ts";
import type { WorkspaceResources } from "../workspace/resource-port.ts";

export interface InventoryEntry {
  path: string;
  size: number;
  sha256: string;
}

export interface WorkspaceFileEntry {
  path: string;
  size: number | null;
}

export function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function childPath(parent: string, name: string): string {
  return `${parent}/${name}`;
}

export async function inventoryWorkspace(input: {
  resources: WorkspaceResources;
  workspaceRoot: WorkspaceTreeRef;
  excludePrefix?: string;
  maxFiles: number;
  maxBytes: number;
}): Promise<InventoryEntry[]> {
  const files: InventoryEntry[] = [];
  let totalBytes = 0;

  const paths = await listWorkspaceFiles(input);
  for (const item of paths) {
    if (files.length >= input.maxFiles) throw new Error("migration-file-limit");
    if (item.size !== null && item.size > input.maxBytes - totalBytes) throw new Error("migration-byte-limit");
    const result = await input.resources.read(appendResourcePath(input.workspaceRoot, item.path));
    const content = new Uint8Array(result.content);
    totalBytes += content.byteLength;
    if (totalBytes > input.maxBytes) throw new Error("migration-byte-limit");
    files.push({ path: item.path, size: content.byteLength, sha256: sha256(content) });
  }
  return files;
}

export async function listWorkspaceFiles(input: {
  resources: WorkspaceResources;
  workspaceRoot: WorkspaceTreeRef;
  excludePrefix?: string;
}): Promise<WorkspaceFileEntry[]> {
  const files: WorkspaceFileEntry[] = [];

  async function walk(path: string): Promise<void> {
    const listing = await input.resources.list(appendResourcePath(input.workspaceRoot, path));
    for (const item of [...listing.items].sort((left, right) => left.name.localeCompare(right.name))) {
      const pathName = childPath(path, item.name);
      if (input.excludePrefix && (pathName === input.excludePrefix || pathName.startsWith(`${input.excludePrefix}/`))) continue;
      if (item.isDirectory) {
        await walk(pathName);
        continue;
      }
      files.push({ path: pathName, size: item.size });
    }
  }

  await walk("Dossiers");
  return files;
}

export async function ensureDirectoryPath(
  resources: WorkspaceResources,
  workspaceRoot: WorkspaceTreeRef,
  relativePath: string,
): Promise<void> {
  const segments = relativePath.split("/");
  for (let index = 1; index <= segments.length; index += 1) {
    const path = segments.slice(0, index).join("/");
    const target = appendResourcePath(workspaceRoot, path);
    const stat = await resources.stat(target);
    if (!stat.exists) await resources.mkdir(target);
    else if (!stat.isDirectory) throw new Error("migration-directory-conflict");
  }
}

export async function writeVerifiedCopy(input: {
  resources: WorkspaceResources;
  workspaceRoot: WorkspaceTreeRef;
  path: string;
  content: Uint8Array;
  expectedSha256: string;
}): Promise<void> {
  const parent = input.path.slice(0, input.path.lastIndexOf("/"));
  await ensureDirectoryPath(input.resources, input.workspaceRoot, parent);
  const target = appendResourcePath(input.workspaceRoot, input.path);
  await input.resources.write(target, input.content);
  const copied = new Uint8Array((await input.resources.read(target)).content);
  if (sha256(copied) !== input.expectedSha256) throw new Error("migration-backup-verification-failed");
}
