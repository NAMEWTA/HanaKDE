import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { registerExchangeRoutes } from "../../src/interfaces/routes/exchange/register-exchange-routes.ts";
import * as commitTool from "../../tools/exchange-commit-import.ts";
import * as detectTool from "../../tools/exchange-detect-library.ts";
import * as exportTool from "../../tools/exchange-export.ts";
import * as inspectTool from "../../tools/exchange-inspect-import.ts";

describe("dossier exchange interfaces", () => {
  it("registers the complete route surface", () => {
    const routes: string[] = [];
    const app = {
      get(path: string) { routes.push(`GET ${path}`); },
      post(path: string) { routes.push(`POST ${path}`); },
    };
    registerExchangeRoutes(app as never, { resources: {} as never });
    assert.deepEqual(routes, [
      "GET /exchange/library/detect",
      "POST /exchange/dossiers/:dossierId/export",
      "POST /exchange/import/inspect",
      "POST /exchange/import/commit",
    ]);
  });

  it("keeps inspection read-only and reviewer-binds every write tool", () => {
    assert.equal(inspectTool.sessionPermission.readOnly, true);
    assert.equal(inspectTool.sessionPermission.kind, "read_only");
    for (const tool of [detectTool, exportTool, commitTool]) {
      assert.equal(tool.sessionPermission.kind, "workspace_write");
      assert.equal(tool.sessionPermission.auto, "review");
      assert.equal(tool.sessionPermission.describeSideEffect?.({ workspaceMountId: "workspace" })?.workspaceMountId, "workspace");
    }
  });

  it("returns bounded validation errors without echoing archive paths", async () => {
    const result = await inspectTool.execute({ workspaceMountId: "workspace", archiveRef: { kind: "local-file", path: "C:/private/archive.zip" } }, { resources: {} as never });
    assert.equal("isError" in result && result.isError, true);
    assert.doesNotMatch(JSON.stringify(result), /C:\/private\/archive\.zip/);
  });
});
