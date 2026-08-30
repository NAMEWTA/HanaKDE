import { createStableId } from "./domain/ids.ts";
import { JournaledJsonRepository } from "./infrastructure/workspace/journaled-json-repository.ts";
import type { WorkspaceTreeRef } from "./infrastructure/workspace/resource-path.ts";
import type { WorkspaceResources } from "./infrastructure/workspace/resource-port.ts";
import { openWorkspaceLibrary } from "./infrastructure/workspace/workspace-library.ts";

export interface DossiersRequestScope {
  resources: WorkspaceResources;
  workspaceRoot: WorkspaceTreeRef;
}

export interface DossiersRuntimeOptions {
  now?: () => string;
  createId?: () => string;
}

export class DossiersRuntime {
  readonly #now: () => string;
  readonly #createId: () => string;
  readonly #openTails = new Map<string, Promise<void>>();

  constructor(options: DossiersRuntimeOptions = {}) {
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#createId = options.createId ?? (() => createStableId("lib"));
  }

  async openLibrary(scope: DossiersRequestScope) {
    const key = scope.workspaceRoot.kind === "mount"
      ? `mount:${scope.workspaceRoot.mountId}:${scope.workspaceRoot.path}`
      : `local:${scope.workspaceRoot.path}`;
    const previous = this.#openTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => lock);
    this.#openTails.set(key, tail);
    await previous;
    try {
      return await openWorkspaceLibrary({
        ...scope,
        now: this.#now,
        createId: this.#createId,
      });
    } finally {
      release();
      if (this.#openTails.get(key) === tail) this.#openTails.delete(key);
    }
  }

  jsonRepository(scope: DossiersRequestScope): JournaledJsonRepository {
    return new JournaledJsonRepository(scope);
  }
}
