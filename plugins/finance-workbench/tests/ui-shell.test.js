import assert from "node:assert/strict";
import test from "node:test";
import { renderShell } from "../routes/ui.js";

function hono(css = "") { return { req: { query: (key) => key === "hana-css" ? css : "" } }; }

test("shell uses official same-origin assets and rejects external hana-css", () => {
  const safe = renderShell(hono("%2Fassets%2Fhana.css"), { pluginId: "finance-workbench" }, "page");
  assert.match(safe, /href="\/assets\/hana\.css"/);
  assert.match(safe, /\/api\/plugins\/finance-workbench\/assets\/panel\.css/);
  assert.match(safe, /\/api\/plugins\/finance-workbench\/assets\/panel\.js/);
  assert.doesNotMatch(renderShell(hono("https%3A%2F%2Fevil.test%2Fhana.css"), { pluginId: "finance-workbench" }, "page"), /evil\.test/);
});
