import fs from "fs";
import path from "path";
import { atomicWriteSync } from "../../shared/safe-fs.ts";
import {
  KNOWLEDGE_SOURCE_CAPABILITIES,
  parseKnowledgeResourceAddress,
  parseKnowledgeSourceDto,
  type KnowledgeResourceAddress,
  type KnowledgeSourceCapability,
  type KnowledgeSourceDto,
} from "../../shared/knowledge-workspace-contract.ts";
import {
  createKnowledgeWorkspaceError,
  KnowledgeWorkspaceError,
} from "../../shared/knowledge-workspace-errors.ts";
import {
  ProviderRootIdentityBroker,
} from "../../lib/resource-io/root-identity.ts";
import type {
  ProviderRootIdentity,
  ResourceOperationContext,
  ResourceProviderCapabilities,
  ResourceRef,
} from "../../lib/resource-io/types.ts";

const SOURCE_BINDINGS_FILE = "knowledge-workspace/source-bindings/v1.json";
const SOURCE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const FORBIDDEN_INPUT_FIELDS = new Set([
  "principal",
  "principalId",
  "userId",
  "studioId",
  "owner",
  "ownerId",
  "scope",
  "scopeToken",
  "sessionId",
  "windowId",
  "resolvedPath",
  "filePath",
  "absolutePath",
  "path",
  "root",
  "rootId",
  "rootIdentity",
  "opaqueRootId",
  "identityNamespace",
  "token",
  "credential",
  "credentials",
  "content",
]);

type SourceRecord = {
  dto: KnowledgeSourceDto;
  root: ResourceRef;
  identity: ProviderRootIdentity;
};

type SourceBinding = {
  workspaceOpaqueRootId: string;
  sourceKey: string;
  sourceOpaqueRootId: string;
  displayName: string;
};

type ResourceIoIdentitySurface = {
  getRootIdentity(
    root: ResourceRef,
    context?: ResourceOperationContext,
  ): Promise<ProviderRootIdentity>;
  capabilitiesFor(root: ResourceRef): ResourceProviderCapabilities;
};

export type RegisterKnowledgeSourceInput = {
  sourceKey: string;
  displayName: string;
  root: ResourceRef;
};

export class SourceRegistry {
  readonly #resourceIO: ResourceIoIdentitySurface;
  readonly #broker: ProviderRootIdentityBroker;
  readonly #context: ResourceOperationContext;
  readonly #hanakoHome: string;
  readonly #active = new Map<string, SourceRecord>();
  #mutationTail: Promise<void> = Promise.resolve();
  #workspaceOpaqueRootId!: string;

  private constructor({
    resourceIO,
    broker,
    context,
    hanakoHome,
  }: {
    resourceIO: ResourceIoIdentitySurface;
    broker: ProviderRootIdentityBroker;
    context: ResourceOperationContext;
    hanakoHome: string;
  }) {
    this.#resourceIO = resourceIO;
    this.#broker = broker;
    this.#context = context;
    this.#hanakoHome = hanakoHome;
  }

  static async create({
    mainRoot,
    mainDisplayName = "Main",
    resourceIO,
    broker = new ProviderRootIdentityBroker(),
    context = {},
    hanakoHome,
  }: {
    mainRoot: ResourceRef;
    mainDisplayName?: string;
    resourceIO: ResourceIoIdentitySurface;
    broker?: ProviderRootIdentityBroker;
    context?: ResourceOperationContext;
    hanakoHome: string;
  }): Promise<SourceRegistry> {
    const registry = new SourceRegistry({
      resourceIO,
      broker,
      context,
      hanakoHome,
    });
    const identity = await registry.#getIdentity(mainRoot);
    registry.#workspaceOpaqueRootId = identity.opaqueRootId;
    registry.#active.set("main", {
      root: cloneRef(mainRoot),
      identity,
      dto: registry.#makeDto({
        sourceKey: "main",
        displayName: mainDisplayName,
        role: "main",
        root: mainRoot,
      }),
    });
    return registry;
  }

  list(): KnowledgeSourceDto[] {
    return [...this.#active.values()].map((source) =>
      cloneDto(this.#currentDto(source))
    );
  }

  get(sourceKey: string): KnowledgeSourceDto | null {
    const source = this.#active.get(sourceKey);
    return source ? cloneDto(this.#currentDto(source)) : null;
  }

  rootRef(sourceKey: string): ResourceRef {
    const source = this.#active.get(sourceKey);
    if (!source) {
      throw createKnowledgeWorkspaceError(
        "knowledge_resource_not_found",
        "knowledge source is not active",
      );
    }
    return cloneRef(source.root);
  }

  async resolveAddress(address: KnowledgeResourceAddress): Promise<ResourceRef> {
    const parsed = parseKnowledgeResourceAddress(address);
    if (parsed.ok === false) {
      throw Object.assign(new Error("invalid knowledge resource address"), parsed.error);
    }
    await this.revalidate(parsed.value.sourceKey);
    const root = this.rootRef(parsed.value.sourceKey);
    if (parsed.value.relativePath.includes("\\")) {
      throw createKnowledgeWorkspaceError(
        "knowledge_operation_precondition_failed",
        "knowledge source provider does not support literal backslash segments",
      );
    }
    if (root.kind === "local-file") {
      const rootPath = realOrResolved(root.path);
      const candidatePath = realOrResolved(path.join(
        rootPath,
        ...parsed.value.relativePath.split("/"),
      ));
      if (!isInsideRoot(rootPath, candidatePath)) {
        throw createKnowledgeWorkspaceError(
          "knowledge_resource_out_of_scope",
          "knowledge resource address escapes its source",
        );
      }
      return {
        kind: "local-file",
        path: candidatePath,
      };
    }
    if (root.kind === "mount") {
      return {
        kind: "mount",
        mountId: root.mountId,
        path: [root.path, parsed.value.relativePath]
          .filter(Boolean)
          .join("/"),
      };
    }
    throw createKnowledgeWorkspaceError(
      "knowledge_operation_precondition_failed",
      "knowledge source provider cannot resolve child resources",
    );
  }

  async register(input: RegisterKnowledgeSourceInput): Promise<KnowledgeSourceDto> {
    return this.#withMutationLock(() => this.#register(input));
  }

  async #register(input: RegisterKnowledgeSourceInput): Promise<KnowledgeSourceDto> {
    validateRegistrationInput(input);
    if (input.sourceKey === "main" || this.#active.has(input.sourceKey)) {
      throw createKnowledgeWorkspaceError(
        "knowledge_resource_conflict",
        "knowledge source key is already active",
      );
    }
    const identity = await this.#getIdentity(input.root);
    await this.#assertDisjoint(identity);
    this.#assertHistoricalKey(input.sourceKey, identity.opaqueRootId);

    const dto = this.#makeDto({
      sourceKey: input.sourceKey,
      displayName: input.displayName,
      role: "mounted",
      root: input.root,
    });
    this.#rememberBinding({
      workspaceOpaqueRootId: this.#workspaceOpaqueRootId,
      sourceKey: input.sourceKey,
      sourceOpaqueRootId: identity.opaqueRootId,
      displayName: input.displayName,
    });
    this.#active.set(input.sourceKey, {
      root: cloneRef(input.root),
      identity,
      dto,
    });
    return cloneDto(dto);
  }

  async remove(sourceKey: string): Promise<KnowledgeSourceDto> {
    return this.#withMutationLock(() => this.#remove(sourceKey));
  }

  #remove(sourceKey: string): KnowledgeSourceDto {
    if (sourceKey === "main") {
      throw createKnowledgeWorkspaceError(
        "knowledge_operation_precondition_failed",
        "main source cannot be removed",
      );
    }
    const source = this.#active.get(sourceKey);
    if (!source) {
      throw createKnowledgeWorkspaceError(
        "knowledge_resource_not_found",
        "knowledge source is not active",
      );
    }
    this.#active.delete(sourceKey);
    return cloneDto(source.dto);
  }

  async revalidate(sourceKey: string): Promise<void> {
    return this.#withMutationLock(() => this.#revalidate(sourceKey));
  }

  async #revalidate(sourceKey: string): Promise<void> {
    const source = this.#active.get(sourceKey);
    if (!source) {
      throw createKnowledgeWorkspaceError(
        "knowledge_resource_not_found",
        "knowledge source is not active",
      );
    }
    const current = await this.#getIdentity(source.root);
    if (
      current.opaqueRootId !== source.identity.opaqueRootId
      || current.scopeToken !== source.identity.scopeToken
    ) {
      throw createKnowledgeWorkspaceError(
        "source_root_identity_unprovable",
        "knowledge source root identity changed",
      );
    }
    for (const [otherKey, other] of this.#active) {
      if (otherKey === sourceKey) continue;
      const relation = await this.#broker.compareRoots(current, other.identity);
      rejectNonDisjoint(relation);
    }
  }

  #makeDto({
    sourceKey,
    displayName,
    role,
    root,
  }: {
    sourceKey: string;
    displayName: string;
    role: "main" | "mounted";
    root: ResourceRef;
  }): KnowledgeSourceDto {
    const providerCapabilities = this.#resourceIO.capabilitiesFor(root);
    const capabilities = KNOWLEDGE_SOURCE_CAPABILITIES.filter((capability) =>
      capabilityAvailable(capability, providerCapabilities)
    );
    const candidate: KnowledgeSourceDto = {
      sourceKey,
      displayName,
      role,
      capabilities,
      availability: "available",
    };
    const parsed = parseKnowledgeSourceDto(candidate);
    if (parsed.ok === false) {
      throw Object.assign(
        new Error("invalid knowledge source"),
        parsed.error,
      );
    }
    return Object.freeze(parsed.value);
  }

  #currentDto(source: SourceRecord): KnowledgeSourceDto {
    try {
      const dto = this.#makeDto({
        sourceKey: source.dto.sourceKey,
        displayName: source.dto.displayName,
        role: source.dto.role,
        root: source.root,
      });
      source.dto = dto;
      return dto;
    } catch {
      const unavailable = Object.freeze({
        ...source.dto,
        capabilities: [],
        availability: "unavailable" as const,
      });
      source.dto = unavailable;
      return unavailable;
    }
  }

  async #getIdentity(root: ResourceRef): Promise<ProviderRootIdentity> {
    try {
      return await this.#resourceIO.getRootIdentity(root, this.#context);
    } catch (error) {
      if (error instanceof KnowledgeWorkspaceError) throw error;
      throw createKnowledgeWorkspaceError(
        "source_root_identity_unprovable",
        "provider could not prove source root identity",
      );
    }
  }

  async #assertDisjoint(identity: ProviderRootIdentity): Promise<void> {
    for (const source of this.#active.values()) {
      const relation = await this.#broker.compareRoots(identity, source.identity);
      rejectNonDisjoint(relation);
    }
  }

  #assertHistoricalKey(sourceKey: string, opaqueRootId: string): void {
    const history = loadBindings(this.#hanakoHome);
    const prior = history.bindings.find((binding) =>
      binding.workspaceOpaqueRootId === this.#workspaceOpaqueRootId
      && binding.sourceKey === sourceKey
    );
    if (prior && prior.sourceOpaqueRootId !== opaqueRootId) {
      throw createKnowledgeWorkspaceError(
        "knowledge_resource_conflict",
        "historical knowledge source key belongs to another root",
      );
    }
  }

  #rememberBinding(binding: SourceBinding): void {
    const history = loadBindings(this.#hanakoHome);
    const index = history.bindings.findIndex((item) =>
      item.workspaceOpaqueRootId === binding.workspaceOpaqueRootId
      && item.sourceKey === binding.sourceKey
    );
    if (index >= 0) history.bindings[index] = binding;
    else history.bindings.push(binding);
    writeBindings(this.#hanakoHome, history);
  }

  async #withMutationLock<T>(operation: () => T | Promise<T>): Promise<T> {
    const previous = this.#mutationTail;
    let release!: () => void;
    this.#mutationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function rejectNonDisjoint(relation: Awaited<ReturnType<ProviderRootIdentityBroker["compareRoots"]>>): void {
  if (relation === "disjoint") return;
  if (relation === "unknown") {
    throw createKnowledgeWorkspaceError(
      "source_root_identity_unprovable",
      "source root relationship is not provable",
    );
  }
  throw createKnowledgeWorkspaceError(
    "source_root_not_disjoint",
    "source roots overlap",
  );
}

function validateRegistrationInput(input: RegisterKnowledgeSourceInput): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw contractError("invalid_contract_value");
  }
  if (!SOURCE_KEY_PATTERN.test(String(input.sourceKey || ""))) {
    throw contractError("invalid_source_key", "sourceKey");
  }
  if (typeof input.displayName !== "string" || !input.displayName.trim()) {
    throw contractError("invalid_display_name", "displayName");
  }
  if (!input.root || typeof input.root !== "object" || Array.isArray(input.root)) {
    throw contractError("invalid_contract_value", "root");
  }
}

export function parseRegisterSourceRequest(input: unknown): {
  sourceKey: string;
  displayName: string;
  mountId: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw contractError("invalid_contract_value");
  }
  const value = input as Record<string, unknown>;
  const allowed = new Set(["sourceKey", "displayName", "mountId"]);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw contractError(
        FORBIDDEN_INPUT_FIELDS.has(field)
          ? "forbidden_contract_field"
          : "unexpected_field",
        field,
      );
    }
  }
  if (!SOURCE_KEY_PATTERN.test(String(value.sourceKey || "")) || value.sourceKey === "main") {
    throw contractError("invalid_source_key", "sourceKey");
  }
  if (typeof value.displayName !== "string" || !value.displayName.trim()) {
    throw contractError("invalid_display_name", "displayName");
  }
  if (
    typeof value.mountId !== "string"
    || !value.mountId.trim()
    || value.mountId === "default"
    || value.mountId.length > 128
  ) {
    throw contractError("invalid_contract_value", "mountId");
  }
  return {
    sourceKey: value.sourceKey as string,
    displayName: value.displayName.trim(),
    mountId: value.mountId.trim(),
  };
}

function capabilityAvailable(
  capability: KnowledgeSourceCapability,
  provider: ResourceProviderCapabilities,
): boolean {
  if (capability === "restore") return false;
  if (capability === "transfer") {
    return provider.exportTree === true && provider.importTree === true;
  }
  return provider[capability as keyof ResourceProviderCapabilities] === true;
}

function cloneRef<T extends ResourceRef>(ref: T): T {
  return JSON.parse(JSON.stringify(ref));
}

function cloneDto(dto: KnowledgeSourceDto): KnowledgeSourceDto {
  return {
    ...dto,
    capabilities: [...dto.capabilities],
  };
}

function bindingsPath(hanakoHome: string): string {
  return path.join(hanakoHome, SOURCE_BINDINGS_FILE);
}

function realOrResolved(filePath: string): string {
  try {
    return path.normalize(fs.realpathSync(filePath));
  } catch {
    const unresolved: string[] = [];
    let current = path.resolve(filePath);
    while (true) {
      try {
        return path.join(
          path.normalize(fs.realpathSync(current)),
          ...unresolved.reverse(),
        );
      } catch {
        const parent = path.dirname(current);
        if (parent === current) return path.resolve(filePath);
        unresolved.push(path.basename(current));
        current = parent;
      }
    }
  }
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === ""
    || (!relative.startsWith(`..${path.sep}`)
      && relative !== ".."
      && !path.isAbsolute(relative));
}

function loadBindings(hanakoHome: string): {
  schemaVersion: 1;
  bindings: SourceBinding[];
} {
  try {
    const raw: unknown = JSON.parse(
      fs.readFileSync(bindingsPath(hanakoHome), "utf-8"),
    );
    if (
      !isRecord(raw)
      || raw.schemaVersion !== 1
      || !Array.isArray(raw.bindings)
      || raw.bindings.some((binding: unknown) => !validBinding(binding))
    ) {
      throw new Error("invalid source binding history");
    }
    return {
      schemaVersion: 1,
      bindings: raw.bindings.map((binding) => ({ ...binding })),
    };
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") {
      return { schemaVersion: 1, bindings: [] };
    }
    throw createKnowledgeWorkspaceError(
      "source_root_identity_unprovable",
      "source binding history is unavailable",
    );
  }
}

function validBinding(value: unknown): value is SourceBinding {
  return isRecord(value)
    && typeof value.workspaceOpaqueRootId === "string"
    && typeof value.sourceKey === "string"
    && typeof value.sourceOpaqueRootId === "string"
    && typeof value.displayName === "string";
}

function writeBindings(
  hanakoHome: string,
  data: { schemaVersion: 1; bindings: SourceBinding[] },
): void {
  const filePath = bindingsPath(hanakoHome);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  atomicWriteSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function contractError(code: string, field?: string): Error {
  return Object.assign(new Error("invalid knowledge source request"), {
    code,
    status: 400,
    httpStatus: 400,
    retryable: false,
    ...(field ? { details: Object.freeze({ field }) } : {}),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string"
    ? error.code
    : undefined;
}
