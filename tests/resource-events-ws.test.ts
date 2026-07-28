import { describe, expect, it } from "vitest";

import { toResourceEventWsMessage } from "../server/resource-events-ws.ts";
import {
  createWsClientRecord,
  wsClientCanReceiveEvent,
} from "../server/ws-scope.ts";

describe("toResourceEventWsMessage", () => {
  it("forwards resource.changed events with their resource identity", () => {
    const event = {
      type: "resource.changed",
      changeType: "modified",
      resourceKey: "local_fs:/workspace/notes/a.md",
      resource: {
        kind: "local-file",
        provider: "local_fs",
        path: "/workspace/notes/a.md",
        filePath: "/workspace/notes/a.md",
      },
      version: { mtimeMs: 1000, size: 12 },
      source: "provider_watch",
      sequence: 7,
      occurredAt: "2026-06-21T09:00:00.000Z",
    };

    expect(toResourceEventWsMessage(event, null)).toEqual({
      type: "resource.resync_required",
      stale: true,
      resync: "resource-stat-required",
      source: "provider_watch",
      sequence: 7,
      occurredAt: "2026-06-21T09:00:00.000Z",
    });
  });

  it("uses the hub session path when a resource event is session-scoped by the bus", () => {
    const event = {
      type: "resource.changed",
      changeType: "created",
      resourceKey: "local_fs:/workspace/notes/new.md",
      resource: {
        kind: "local-file",
        provider: "local_fs",
        path: "/workspace/notes/new.md",
      },
      source: "agent_tool",
      sequence: 8,
      occurredAt: "2026-06-21T09:01:00.000Z",
    };

    expect(toResourceEventWsMessage(event, "/sessions/a.jsonl")).toEqual({
      type: "resource.resync_required",
      stale: true,
      resync: "resource-stat-required",
      source: "agent_tool",
      sequence: 8,
      occurredAt: "2026-06-21T09:01:00.000Z",
    });
  });

  it("forwards delete and rename resource events", () => {
    expect(toResourceEventWsMessage({
      type: "resource.deleted",
      resourceKey: "local_fs:/workspace/notes/old.md",
      resource: { kind: "local-file", provider: "local_fs", path: "/workspace/notes/old.md" },
      source: "provider_watch",
      sequence: 9,
      occurredAt: "2026-06-21T09:02:00.000Z",
    }, null)).toMatchObject({ type: "resource.resync_required", stale: true });

    expect(toResourceEventWsMessage({
      type: "resource.renamed",
      oldResourceKey: "local_fs:/workspace/notes/old.md",
      newResourceKey: "local_fs:/workspace/notes/new.md",
      oldResource: { kind: "local-file", provider: "local_fs", path: "/workspace/notes/old.md" },
      newResource: { kind: "local-file", provider: "local_fs", path: "/workspace/notes/new.md" },
      source: "provider_watch",
      sequence: 10,
      occurredAt: "2026-06-21T09:03:00.000Z",
    }, null)).toMatchObject({ type: "resource.resync_required", stale: true });
  });

  it("binds the safe resync projection to its Studio for paired file readers", () => {
    const message = toResourceEventWsMessage({
      type: "resource.changed",
      changeType: "modified",
      resourceKey: "local_fs:/private/workspace/a.md",
      resource: {
        kind: "local-file",
        path: "/private/workspace/a.md",
      },
      source: "provider_watch",
      sequence: 11,
      occurredAt: "2026-07-28T00:00:00.000Z",
    }, null, null, "studio_1");
    const client = createWsClientRecord({
      principal: {
        kind: "device",
        deviceId: "device_1",
        userId: "user_1",
        studioId: "studio_1",
        serverNodeId: "node_1",
        connectionKind: "lan",
        credentialKind: "device_credential",
        scopes: ["files.read"],
      },
    });

    expect(message).toMatchObject({
      type: "resource.resync_required",
      studioId: "studio_1",
      sequence: 11,
    });
    expect(wsClientCanReceiveEvent(client, message)).toBe(true);
    expect(JSON.stringify(message)).not.toContain("/private/workspace");
  });

  it("ignores non-resource events", () => {
    expect(toResourceEventWsMessage({ type: "demo_event" }, "/sessions/a.jsonl")).toBeNull();
  });

  it("never executes getters or proxy traps and rejects oversized/symbol input", () => {
    let getterRuns = 0;
    const accessor = Object.create(null);
    Object.defineProperty(accessor, "type", { enumerable: true, get() { getterRuns += 1; return "resource.deleted"; } });
    expect(toResourceEventWsMessage(accessor)).toBeNull();
    expect(getterRuns).toBe(0);
    expect(toResourceEventWsMessage(new Proxy({}, { ownKeys() { throw new Error("trap"); } }))).toBeNull();
    expect(toResourceEventWsMessage({ type: "resource.deleted", source: "api", sequence: 1, occurredAt: "2026-01-01T00:00:00Z", [Symbol("secret")]: "token" })).toBeNull();
    expect(toResourceEventWsMessage({ type: "resource.deleted", source: "api", sequence: 1, occurredAt: "2026-01-01T00:00:00Z", ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`x${i}`, i])) })).toBeNull();
  });
});
