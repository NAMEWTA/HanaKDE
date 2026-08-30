import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Hono } from "hono";

import { registerIndexRoutes } from "../../src/interfaces/routes/index/register-index-routes.ts";
import { MemoryResources } from "../foundation/memory-resources.ts";

test("index routes require a safe workspace mount and keep cache paths out of responses", async (t) => {
  const resources = new MemoryResources();
  const dataDir = mkdtempSync(join(tmpdir(), "hana-dossiers-route-index-"));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const app = new Hono();
  registerIndexRoutes(app, { resources, dataDir } as never);
  assert.equal((await app.request("/index/status")).status, 400);
  assert.equal((await app.request("/index/status?workspaceMountId=C%3A%2Fsecret")).status, 400);
  const valid = await app.request("/index/status?workspaceMountId=workspace");
  assert.equal(valid.status, 200);
  assert.doesNotMatch(JSON.stringify(await valid.json()), /hana-dossiers-route-index|catalog\.sqlite|C:\\|file:\/\//);
  assert.equal((await app.request("/index/search?workspaceMountId=workspace&limit=101")).status, 400);
});
