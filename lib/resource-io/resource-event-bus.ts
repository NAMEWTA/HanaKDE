import type {
  ResourceChangedEvent,
  ResourceDeletedEvent,
  ResourceEvent,
  ResourceEventCatchUpResult,
  ResourceRenamedEvent,
} from "./types.ts";

type EventEmit = (event: ResourceEvent, sessionPath?: string | null) => unknown;
type EventSubscriber = (event: ResourceEvent) => unknown;

type ResourceEventBusOptions = {
  emit: EventEmit;
  now?: () => Date;
  dedupeSize?: number;
  retentionSize?: number;
};

type ChangedInput = Omit<ResourceChangedEvent, "type" | "sequence" | "occurredAt">;
type DeletedInput = Omit<ResourceDeletedEvent, "type" | "sequence" | "occurredAt">;
type RenamedInput = Omit<ResourceRenamedEvent, "type" | "sequence" | "occurredAt">;

export class ResourceEventBus {
  declare _emit: EventEmit;
  declare _now: () => Date;
  declare _sequence: number;
  declare _dedupeSize: number;
  declare _retentionSize: number;
  declare _recentChangedKeys: Set<string>;
  declare _recentEvents: ResourceEvent[];
  declare _subscribers: Set<EventSubscriber>;

  constructor({ emit, now = () => new Date(), dedupeSize = 512, retentionSize = 1000 }: ResourceEventBusOptions) {
    if (typeof emit !== "function") throw new Error("ResourceEventBus requires emit");
    this._emit = emit;
    this._now = now;
    this._sequence = 0;
    this._dedupeSize = dedupeSize;
    this._retentionSize = Math.max(0, Math.floor(Number(retentionSize) || 0));
    this._recentChangedKeys = new Set();
    this._recentEvents = [];
    this._subscribers = new Set();
  }

  subscribe(subscriber: EventSubscriber): () => void {
    if (typeof subscriber !== "function") {
      throw new TypeError("ResourceEventBus subscriber must be a function");
    }
    this._subscribers.add(subscriber);
    return () => this._subscribers.delete(subscriber);
  }

  latestSequence(): number {
    return this._sequence;
  }

  changed(input: ChangedInput): ResourceChangedEvent | null {
    const dedupeKey = changedDedupeKey(input);
    if (dedupeKey && this._recentChangedKeys.has(dedupeKey)) return null;
    if (dedupeKey) this._rememberChangedKey(dedupeKey);

    const event: ResourceChangedEvent = {
      ...input,
      type: "resource.changed",
      sequence: this._nextSequence(),
      occurredAt: this._now().toISOString(),
    };
    this._rememberEvent(event);
    this._notifySubscribers(event);
    this._emitSafely(event, input.sessionPath ?? null);
    return event;
  }

  deleted(input: DeletedInput): ResourceDeletedEvent {
    const event: ResourceDeletedEvent = {
      ...input,
      type: "resource.deleted",
      sequence: this._nextSequence(),
      occurredAt: this._now().toISOString(),
    };
    this._rememberEvent(event);
    this._notifySubscribers(event);
    this._emitSafely(event, input.sessionPath ?? null);
    return event;
  }

  renamed(input: RenamedInput): ResourceRenamedEvent {
    const event: ResourceRenamedEvent = {
      ...input,
      type: "resource.renamed",
      sequence: this._nextSequence(),
      occurredAt: this._now().toISOString(),
    };
    this._rememberEvent(event);
    this._notifySubscribers(event);
    this._emitSafely(event, input.sessionPath ?? null);
    return event;
  }

  since(sequence: number): ResourceEventCatchUpResult {
    const cursor = Number.isFinite(Number(sequence)) ? Math.max(0, Math.floor(Number(sequence))) : 0;
    const latestSequence = this._sequence;
    if (!this._recentEvents.length) {
      return {
        stale: cursor < latestSequence,
        latestSequence,
        events: [],
      };
    }

    const oldestSequence = this._recentEvents[0]?.sequence || latestSequence;
    if (cursor < oldestSequence - 1) {
      return { stale: true, latestSequence, events: [] };
    }

    return {
      stale: false,
      latestSequence,
      events: this._recentEvents.filter((event) => event.sequence > cursor),
    };
  }

  _nextSequence(): number {
    this._sequence += 1;
    return this._sequence;
  }

  _rememberChangedKey(key: string): void {
    this._recentChangedKeys.add(key);
    while (this._recentChangedKeys.size > this._dedupeSize) {
      const first = this._recentChangedKeys.values().next().value;
      if (!first) break;
      this._recentChangedKeys.delete(first);
    }
  }

  _rememberEvent(event: ResourceEvent): void {
    if (this._retentionSize <= 0) return;
    this._recentEvents.push(event);
    while (this._recentEvents.length > this._retentionSize) {
      this._recentEvents.shift();
    }
  }

  _notifySubscribers(event: ResourceEvent): void {
    for (const subscriber of this._subscribers) {
      try {
        this._consumeThenable(subscriber(event));
      } catch {
        // Runtime projections observe committed resource mutations. Their
        // failures must not turn the producer operation into a false failure.
      }
    }
  }

  _emitSafely(event: ResourceEvent, sessionPath: string | null): void {
    try {
      this._consumeThenable(this._emit(event, sessionPath));
    } catch {
      // The committed event stays available through this ordered fact source
      // even when one downstream fan-out path is temporarily unavailable.
    }
  }

  _consumeThenable(value: unknown): void {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return;
    try {
      if (typeof (value as PromiseLike<unknown>).then !== "function") return;
      void Promise.resolve(value).catch(() => {
        // Runtime projections cannot roll back a committed resource event.
      });
    } catch {
      // A broken thenable is isolated like any other projection failure.
    }
  }
}

function changedDedupeKey(input: ChangedInput): string | null {
  const version = input.version;
  if (!version) return null;
  // Delimiter-safe, type-tagged fields preserve the prior structural key
  // semantics without allocating an object and serializing it for every
  // filesystem notification in a burst.
  return [
    input.resourceKey,
    input.changeType,
    version.mtimeMs,
    version.size,
    version.sha256,
    version.etag,
    version.sequence,
  ].map((value) => {
    if (value === undefined) return "u";
    if (value === null) return "n";
    const text = String(value);
    return `${typeof value}:${text.length}:${text}`;
  }).join("|");
}
