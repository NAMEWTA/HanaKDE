type ResourceRef =
  | { kind: "mount"; mountId: string; path: string }
  | { kind: "local-file"; path: string };

type Entry =
  | { kind: "directory"; version: number }
  | { kind: "file"; content: Uint8Array; version: number };

function keyOf(ref: ResourceRef): string {
  if (ref.kind === "mount") return `mount:${ref.mountId}:${ref.path.replaceAll("\\", "/")}`;
  return `local:${ref.path.replaceAll("\\", "/")}`;
}

function pathOf(ref: ResourceRef): string {
  return ref.path.replaceAll("\\", "/").replace(/\/$/, "");
}

function parentPrefix(ref: ResourceRef): string {
  const path = pathOf(ref);
  const identity = ref.kind === "mount" ? `mount:${ref.mountId}:` : "local:";
  return `${identity}${path ? `${path}/` : ""}`;
}

export class MemoryResources {
  readonly mutations: string[] = [];
  readonly entries = new Map<string, Entry>();
  private sequence = 0;
  private readonly failures = new Map<string, Map<number, Error>>();
  private readonly callCounts = new Map<string, number>();

  failNext(operation: string, message = "injected resource failure"): void {
    this.failOn(operation, (this.callCounts.get(operation) ?? 0) + 1, message);
  }

  failOn(operation: string, occurrence: number, message = "injected resource failure"): void {
    const scheduled = this.failures.get(operation) ?? new Map<number, Error>();
    scheduled.set(occurrence, new Error(message));
    this.failures.set(operation, scheduled);
  }

  failAfter(operation: string, successfulCallsBeforeFailure: number, message = "injected resource failure"): void {
    this.failOn(operation, (this.callCounts.get(operation) ?? 0) + successfulCallsBeforeFailure + 1, message);
  }

  private maybeFail(operation: string): void {
    const occurrence = (this.callCounts.get(operation) ?? 0) + 1;
    this.callCounts.set(operation, occurrence);
    const failure = this.failures.get(operation)?.get(occurrence);
    if (failure) throw failure;
  }

  seedDirectory(ref: ResourceRef): void {
    this.entries.set(keyOf(ref), { kind: "directory", version: ++this.sequence });
  }

  seedFile(ref: ResourceRef, content: string): void {
    this.entries.set(keyOf(ref), {
      kind: "file",
      content: new TextEncoder().encode(content),
      version: ++this.sequence,
    });
  }

  text(ref: ResourceRef): string | null {
    const entry = this.entries.get(keyOf(ref));
    return entry?.kind === "file" ? new TextDecoder().decode(entry.content) : null;
  }

  async stat(ref: ResourceRef) {
    this.maybeFail("stat");
    const entry = this.entries.get(keyOf(ref));
    return {
      resourceKey: keyOf(ref),
      resource: ref,
      exists: Boolean(entry),
      isDirectory: entry?.kind === "directory",
      ...(entry ? { version: { sequence: entry.version } } : {}),
    };
  }

  async list(ref: ResourceRef) {
    this.maybeFail("list");
    const prefix = parentPrefix(ref);
    const items = new Map<string, { name: string; isDirectory: boolean; size: number | null; mtimeMs: number }>();
    for (const [key, entry] of this.entries) {
      if (!key.startsWith(prefix) || key === keyOf(ref)) continue;
      const remainder = key.slice(prefix.length);
      const name = remainder.split("/")[0];
      if (!name) continue;
      const direct = !remainder.includes("/");
      items.set(name, {
        name,
        isDirectory: direct ? entry.kind === "directory" : true,
        size: direct && entry.kind === "file" ? entry.content.byteLength : null,
        mtimeMs: entry.version,
      });
    }
    return { resourceKey: keyOf(ref), resource: ref, items: [...items.values()] };
  }

  async read(ref: ResourceRef) {
    this.maybeFail("read");
    const entry = this.entries.get(keyOf(ref));
    if (!entry || entry.kind !== "file") throw new Error(`ENOENT: ${keyOf(ref)}`);
    return {
      resourceKey: keyOf(ref),
      resource: ref,
      content: entry.content,
      version: { sequence: entry.version },
    };
  }

  async mkdir(ref: ResourceRef) {
    this.maybeFail("mkdir");
    this.mutations.push(`mkdir:${keyOf(ref)}`);
    const version = ++this.sequence;
    this.entries.set(keyOf(ref), { kind: "directory", version });
    return { changeType: "created" as const, resourceKey: keyOf(ref), resource: ref, version: { sequence: version } };
  }

  async write(ref: ResourceRef, content: string | Uint8Array | ArrayBuffer) {
    this.maybeFail("write");
    this.mutations.push(`write:${keyOf(ref)}`);
    const bytes = typeof content === "string"
      ? new TextEncoder().encode(content)
      : content instanceof Uint8Array
        ? content
        : new Uint8Array(content);
    const existed = this.entries.has(keyOf(ref));
    const version = ++this.sequence;
    this.entries.set(keyOf(ref), { kind: "file", content: bytes, version });
    return {
      changeType: existed ? "modified" as const : "created" as const,
      resourceKey: keyOf(ref),
      resource: ref,
      version: { sequence: version },
    };
  }

  async writeExpectedVersion(
    ref: ResourceRef,
    content: string | Uint8Array | ArrayBuffer,
    expectedVersion: { sequence?: number },
  ) {
    this.maybeFail("writeExpectedVersion");
    const entry = this.entries.get(keyOf(ref));
    if (!entry || entry.version !== expectedVersion.sequence) {
      return {
        ok: false as const,
        conflict: true as const,
        resourceKey: keyOf(ref),
        resource: ref,
        ...(entry ? { version: { sequence: entry.version } } : {}),
      };
    }
    return this.write(ref, content);
  }

  async delete(ref: ResourceRef) {
    this.maybeFail("delete");
    this.mutations.push(`delete:${keyOf(ref)}`);
    this.entries.delete(keyOf(ref));
    return { changeType: "modified" as const, resourceKey: keyOf(ref), resource: ref };
  }
}
