import { describe, expect, it, vi } from "vitest";
import { ResourceEventBus } from "../lib/resource-io/resource-event-bus.ts";

describe("ResourceEventBus", () => {
  it("adds sequence and occurredAt before emitting resource events", () => {
    const emit = vi.fn();
    const bus = new ResourceEventBus({
      emit,
      now: () => new Date("2026-06-21T00:00:00.000Z"),
    });

    bus.changed({
      changeType: "modified",
      resourceKey: "local_fs:/repo/a.md",
      resource: { kind: "local-file", path: "/repo/a.md" },
      source: "agent_tool",
      sessionPath: "/sessions/a.jsonl",
    });

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "resource.changed",
      sequence: 1,
      occurredAt: "2026-06-21T00:00:00.000Z",
      resourceKey: "local_fs:/repo/a.md",
    }), "/sessions/a.jsonl");
  });

  it("dedupes identical versioned changed events", () => {
    const emit = vi.fn();
    const bus = new ResourceEventBus({
      emit,
      now: () => new Date("2026-06-21T00:00:00.000Z"),
    });
    const event = {
      changeType: "modified" as const,
      resourceKey: "local_fs:/repo/a.md",
      resource: { kind: "local-file" as const, path: "/repo/a.md" },
      version: { mtimeMs: 1, size: 2 },
      source: "provider_watch" as const,
      sessionPath: null,
    };

    bus.changed(event);
    bus.changed(event);

    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("notifies runtime subscribers without letting one subscriber break producers", () => {
    const emit = vi.fn();
    const first = vi.fn(() => {
      throw new Error("observer failed");
    });
    const second = vi.fn();
    const bus = new ResourceEventBus({ emit });
    const unsubscribeFirst = bus.subscribe(first);
    bus.subscribe(second);

    expect(() => bus.changed({
      changeType: "modified",
      resourceKey: "local_fs:/repo/runtime.md",
      resource: { kind: "local-file", path: "/repo/runtime.md" },
      source: "api",
    })).not.toThrow();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(bus.latestSequence()).toBe(1);

    unsubscribeFirst();
    bus.deleted({
      resourceKey: "local_fs:/repo/runtime.md",
      resource: { kind: "local-file", path: "/repo/runtime.md" },
      source: "api",
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    expect(bus.latestSequence()).toBe(2);
  });

  it("isolates async subscriber failures without an unhandled rejection", async () => {
    const unhandled = vi.fn();
    const onUnhandledRejection = (reason: unknown) => unhandled(reason);
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      const second = vi.fn();
      const bus = new ResourceEventBus({ emit: vi.fn() });
      bus.subscribe(async () => {
        throw new Error("async observer failed");
      });
      bus.subscribe(second);

      expect(() => bus.changed({
        changeType: "modified",
        resourceKey: "local_fs:/repo/async-runtime.md",
        resource: { kind: "local-file", path: "/repo/async-runtime.md" },
        source: "api",
      })).not.toThrow();

      expect(second).toHaveBeenCalledTimes(1);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("isolates async fan-out emitter failures without an unhandled rejection", async () => {
    const unhandled = vi.fn();
    const onUnhandledRejection = (reason: unknown) => unhandled(reason);
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      const received = vi.fn();
      const emit = vi.fn(async () => {
        throw new Error("async fan-out failed");
      });
      const bus = new ResourceEventBus({ emit });
      bus.subscribe(received);

      bus.changed({
        changeType: "modified",
        resourceKey: "local_fs:/repo/async-fan-out.md",
        resource: { kind: "local-file", path: "/repo/async-fan-out.md" },
        source: "api",
      });

      expect(emit).toHaveBeenCalledTimes(1);
      expect(received).toHaveBeenCalledTimes(1);
      expect(bus.since(0).events).toHaveLength(1);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("reports a stale cursor when retained events are unavailable", () => {
    const bus = new ResourceEventBus({
      emit: vi.fn(),
      retentionSize: 0,
    });

    bus.changed({
      changeType: "modified",
      resourceKey: "local_fs:/repo/unretained.md",
      resource: { kind: "local-file", path: "/repo/unretained.md" },
      source: "api",
      version: { sequence: 1 },
    });

    expect(bus.since(0)).toEqual({
      stale: true,
      latestSequence: 1,
      events: [],
    });
  });

  it("keeps a committed event observable when the fan-out emitter fails", () => {
    const received = vi.fn();
    const bus = new ResourceEventBus({
      emit: () => {
        throw new Error("fan-out unavailable");
      },
    });
    bus.subscribe(received);

    expect(() => bus.changed({
      changeType: "modified",
      resourceKey: "local_fs:/repo/committed.md",
      resource: { kind: "local-file", path: "/repo/committed.md" },
      source: "api",
      version: { sequence: 1 },
    })).not.toThrow();

    expect(received).toHaveBeenCalledTimes(1);
    expect(bus.since(0)).toMatchObject({
      stale: false,
      latestSequence: 1,
      events: [expect.objectContaining({ resourceKey: "local_fs:/repo/committed.md" })],
    });
  });
});
