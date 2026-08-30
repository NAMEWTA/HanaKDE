import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { registerMigrationRoutes } from "../../src/interfaces/routes/migration/register-migration-routes.ts";

describe("migration interfaces", () => {
  it("registers status, plan, confirmed execution, and recovery routes", () => {
    const routes: string[] = [];
    const app = {
      get(path: string) { routes.push(`GET ${path}`); },
      post(path: string) { routes.push(`POST ${path}`); },
    };
    registerMigrationRoutes(app as never, { resources: {} as never });
    assert.deepEqual(routes, [
      "GET /migration/status",
      "POST /migration/plan",
      "POST /migration/execute",
      "POST /migration/recover",
    ]);
  });
});
