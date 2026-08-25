import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const required = [
  "manifest.json",
  "package.json",
  "index.ts",
  "routes/api.ts",
  "routes/page.ts",
  "assets/page.js",
  "assets/page.css",
  "src/application/todo-application.ts",
  "src/infrastructure/store.ts",
  "src/runtime.ts",
];
for (const relative of required) {
  const file = path.join(root, relative);
  assert.equal(fs.existsSync(file), true, `missing ${relative}`);
  assert.equal(fs.statSync(file).isFile(), true, `${relative} is not a file`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(manifest.id, "todolist");
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.contributes?.page?.route, "/page");
assert.deepEqual(manifest.ui?.hostCapabilities, ["resource.pick"]);
assert.ok(manifest.capabilities.includes("task.write"));
assert.ok(manifest.capabilities.includes("session.write"));
assert.ok(fs.statSync(path.join(root, "assets/page.js")).size > 1_000);
assert.ok(fs.statSync(path.join(root, "assets/page.css")).size > 1_000);
const pageBundle = fs.readFileSync(path.join(root, "assets/page.js"), "utf8");
assert.match(pageBundle, /X-Hana-Plugin-Surface-Session/u, "Page bundle must authenticate through the Hana SDK");
assert.match(pageBundle, /hana\.ready/u, "Page bundle must use the official ready event");
assert.doesNotMatch(pageBundle, /hana:ready/u, "Page bundle must not emit the obsolete raw ready event");

const toolFiles = fs.readdirSync(path.join(root, "tools"))
  .filter((name) => name.endsWith(".ts"))
  .sort();
assert.ok(toolFiles.length >= 10, "expected the public namespaced tool catalog");

const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), "hana-todolist-package-"));
const installed = path.join(tempParent, "todolist");
try {
  fs.cpSync(root, installed, {
    recursive: true,
    filter(source) {
      const relative = path.relative(root, source);
      return !relative.startsWith("node_modules")
        && !relative.startsWith("exports")
        && !/^store\.v\d+\.json(?:\.|$)/u.test(path.basename(source));
    },
  });

  const imports = [
    "index.ts",
    "routes/api.ts",
    "routes/page.ts",
    ...toolFiles.map((name) => `tools/${name}`),
  ];
  for (const relative of imports) {
    const module = await import(`${pathToFileURL(path.join(installed, relative)).href}?verify=${Date.now()}-${Math.random()}`);
    if (relative.startsWith("tools/")) {
      assert.equal(typeof module.name, "string", `${relative} must export name`);
      assert.equal(typeof module.description, "string", `${relative} must export description`);
      assert.equal(typeof module.execute, "function", `${relative} must export execute`);
      assert.equal(typeof module.parameters, "object", `${relative} must export parameters`);
      const serialized = JSON.stringify(module.sessionPermission ?? {});
      assert.equal(/confirm_cancel|set_state|mark_succeeded|wake/iu.test(serialized), false, `${relative} exposes an internal state transition`);
    }
  }

  const sourceFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:ts|tsx|js|json|css|md)$/u.test(entry.name)) sourceFiles.push(full);
    }
  };
  for (const relative of ["src", "routes", "tools"]) walk(path.join(installed, relative));
  sourceFiles.push(path.join(installed, "index.ts"));
  const source = sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert.equal(/\bsetInterval\s*\(/u.test(source), false, "plugin must not implement a second scheduler");
  assert.equal(/dueAt\s*:/u.test(source), false, "TaskRegistry payload must use runAt");

  console.log(`package smoke passed: ${toolFiles.length} tools, ${imports.length} loadable entrypoints`);
} finally {
  fs.rmSync(tempParent, { recursive: true, force: true });
}
