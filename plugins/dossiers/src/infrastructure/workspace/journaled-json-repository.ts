import { createHash } from "node:crypto";

import { isStableId } from "../../domain/ids.ts";
import { serializeJson } from "../../domain/library-schema.ts";
import { appendResourcePath, normalizeRelativePath, type WorkspaceTreeRef } from "./resource-path.ts";
import type { HanaResourceVersion, WorkspaceResources } from "./resource-port.ts";

type OperationState = "planned" | "committed" | "conflict" | "failed";

interface JsonWriteOperation {
  kind: "hana.dossiers.operation";
  schemaVersion: 1;
  operationId: string;
  operationType: "json.write";
  state: OperationState;
  targetPath: string;
  stagingPath: string;
  payloadSha256: string;
  expectedVersion: HanaResourceVersion | null;
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
  extensions: Record<string, unknown>;
}

export interface JournaledJsonRepositoryInput {
  resources: WorkspaceResources;
  workspaceRoot: WorkspaceTreeRef;
}

export interface JournaledJsonWriteInput {
  operationId: string;
  targetPath: string;
  value: unknown;
  expectedVersion: HanaResourceVersion | null;
  now: string;
}

export type JournaledJsonWriteResult =
  | { status: "committed"; operationId: string; version?: HanaResourceVersion }
  | { status: "conflict"; operationId: string; version?: HanaResourceVersion }
  | { status: "failed"; operationId: string; errorCode: "resource-operation-failed" | "operation-id-reused" | "invalid-operation-journal" };

function operationPath(operationId: string): string {
  return `Dossiers/.system/operations/${operationId}.json`;
}

function stagingPath(operationId: string): string {
  return `Dossiers/.system/staging/${operationId}.json`;
}

function assertAuthorityTarget(path: string): string {
  const normalized = normalizeRelativePath(path);
  if (!normalized.startsWith("Dossiers/") || normalized.startsWith("Dossiers/.system/")) {
    throw new Error("journal target must be an authority path inside Dossiers");
  }
  return normalized;
}

export class JournaledJsonRepository {
  readonly #resources: WorkspaceResources;
  readonly #workspaceRoot: WorkspaceTreeRef;

  constructor(input: JournaledJsonRepositoryInput) {
    this.#resources = input.resources;
    this.#workspaceRoot = input.workspaceRoot;
  }

  async #writeOperation(operation: JsonWriteOperation): Promise<void> {
    await this.#resources.write(
      appendResourcePath(this.#workspaceRoot, operationPath(operation.operationId)),
      serializeJson(operation),
    );
  }

  async #cleanupStaging(stagedRef: WorkspaceTreeRef): Promise<void> {
    try {
      const stat = await this.#resources.stat(stagedRef);
      if (stat.exists && !stat.isDirectory) await this.#resources.delete(stagedRef);
    } catch {
      // Staging is non-authoritative; a later idempotent retry can clean it.
    }
  }

  async write(input: JournaledJsonWriteInput): Promise<JournaledJsonWriteResult> {
    if (!isStableId(input.operationId, "op")) {
      throw new Error("operationId must be a stable op_ identifier");
    }
    const targetPath = assertAuthorityTarget(input.targetPath);
    const stagedPath = stagingPath(input.operationId);
    const content = serializeJson(input.value);
    const payloadSha256 = createHash("sha256").update(content).digest("hex");
    const operation: JsonWriteOperation = {
      kind: "hana.dossiers.operation",
      schemaVersion: 1,
      operationId: input.operationId,
      operationType: "json.write",
      state: "planned",
      targetPath,
      stagingPath: stagedPath,
      payloadSha256,
      expectedVersion: input.expectedVersion,
      createdAt: input.now,
      updatedAt: input.now,
      extensions: {},
    };
    const stagedRef = appendResourcePath(this.#workspaceRoot, stagedPath);
    const targetRef = appendResourcePath(this.#workspaceRoot, targetPath);
    const operationRef = appendResourcePath(this.#workspaceRoot, operationPath(input.operationId));

    try {
      const existingStat = await this.#resources.stat(operationRef);
      if (existingStat.exists) {
        if (existingStat.isDirectory) {
          return { status: "failed", operationId: input.operationId, errorCode: "invalid-operation-journal" };
        }
        const existingValue: unknown = JSON.parse(new TextDecoder().decode((await this.#resources.read(operationRef)).content));
        if (!existingValue || typeof existingValue !== "object" || Array.isArray(existingValue)) {
          return { status: "failed", operationId: input.operationId, errorCode: "invalid-operation-journal" };
        }
        const existing = existingValue as Partial<JsonWriteOperation>;
        if (
          existing.kind !== "hana.dossiers.operation"
          || existing.schemaVersion !== 1
          || existing.operationId !== input.operationId
          || existing.operationType !== "json.write"
          || !new Set<OperationState>(["planned", "committed", "conflict", "failed"]).has(existing.state as OperationState)
          || typeof existing.targetPath !== "string"
          || typeof existing.payloadSha256 !== "string"
        ) {
          return { status: "failed", operationId: input.operationId, errorCode: "invalid-operation-journal" };
        }
        if (
          existing.targetPath !== targetPath
          || existing.payloadSha256 !== payloadSha256
          || JSON.stringify(existing.expectedVersion ?? null) !== JSON.stringify(input.expectedVersion)
        ) {
          return { status: "failed", operationId: input.operationId, errorCode: "operation-id-reused" };
        }
        if (existing.state === "committed") {
          const current = await this.#resources.stat(targetRef);
          await this.#cleanupStaging(stagedRef);
          return { status: "committed", operationId: input.operationId, ...(current.version ? { version: current.version } : {}) };
        }
        if (existing.state === "conflict") {
          const current = await this.#resources.stat(targetRef);
          await this.#cleanupStaging(stagedRef);
          return { status: "conflict", operationId: input.operationId, ...(current.version ? { version: current.version } : {}) };
        }
        const current = await this.#resources.stat(targetRef);
        if (current.exists && !current.isDirectory) {
          const currentContent = (await this.#resources.read(targetRef)).content;
          const currentHash = createHash("sha256").update(currentContent).digest("hex");
          if (currentHash === payloadSha256) {
            operation.state = "committed";
            operation.createdAt = typeof existing.createdAt === "string" ? existing.createdAt : input.now;
            await this.#writeOperation(operation);
            await this.#cleanupStaging(stagedRef);
            return { status: "committed", operationId: input.operationId, ...(current.version ? { version: current.version } : {}) };
          }
        }
      }
    } catch {
      return { status: "failed", operationId: input.operationId, errorCode: "invalid-operation-journal" };
    }

    try {
      await this.#writeOperation(operation);
      await this.#resources.write(stagedRef, content);

      let published;
      if (input.expectedVersion === null) {
        const current = await this.#resources.stat(targetRef);
        if (current.exists) {
          operation.state = "conflict";
          operation.updatedAt = input.now;
          await this.#writeOperation(operation);
          await this.#cleanupStaging(stagedRef);
          return { status: "conflict", operationId: input.operationId, ...(current.version ? { version: current.version } : {}) };
        }
        published = await this.#resources.write(targetRef, content);
      } else {
        published = await this.#resources.writeExpectedVersion(targetRef, content, input.expectedVersion);
        if ("conflict" in published && published.conflict) {
          operation.state = "conflict";
          operation.updatedAt = input.now;
          await this.#writeOperation(operation);
          await this.#cleanupStaging(stagedRef);
          return { status: "conflict", operationId: input.operationId, ...(published.version ? { version: published.version } : {}) };
        }
      }

      operation.state = "committed";
      operation.updatedAt = input.now;
      await this.#writeOperation(operation);
      await this.#cleanupStaging(stagedRef);
      return {
        status: "committed",
        operationId: input.operationId,
        ...(published.version ? { version: published.version } : {}),
      };
    } catch {
      operation.state = "failed";
      operation.updatedAt = input.now;
      operation.errorCode = "resource-operation-failed";
      try {
        await this.#writeOperation(operation);
      } catch {
        // The original failure remains authoritative when the journal cannot be updated.
      }
      return { status: "failed", operationId: input.operationId, errorCode: "resource-operation-failed" };
    }
  }
}
