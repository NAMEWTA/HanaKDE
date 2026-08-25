import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "manifest.json", "index.ts", "assets/app.css", "assets/app.js",
  "routes/page.ts", "routes/state.ts", "routes/resource-io.ts", "tools/render.ts",
  "tests/store.test.ts", "tests/renderer.test.ts", "tests/clipboard.test.ts",
  "tests/download.test.ts", "tests/resource-io.test.ts", "tests/agent-render.test.ts",
  "tests/plugin-shell.test.ts", "tests/policy.test.ts", "tests/surfaces.test.ts",
];

for (const relative of required) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target) || fs.statSync(target).size === 0) {
    throw new Error(`Required package entry is missing or empty: ${relative}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.id !== "markdown-wechat" || manifest.minAppVersion !== "0.0.4") {
  throw new Error("Manifest identity or host compatibility is incorrect");
}
if (manifest.trust !== "full-access" || !manifest.contributes?.page || !manifest.contributes?.widget) {
  throw new Error("Page/Widget full-access contributions are incomplete");
}
if (!manifest.dev?.scenarios?.length) throw new Error("Plugin Dev scenarios are required");

const testFiles = fs.readdirSync(path.join(root, "tests")).filter((name) => name.endsWith(".test.ts"));
if (testFiles.length < 9) throw new Error(`Expected at least 9 test files, found ${testFiles.length}`);
if (fs.statSync(path.join(root, "assets/app.js")).size < 1000) throw new Error("Built UI asset is unexpectedly small");

console.log(`markdown-wechat package verified (${testFiles.length} test files)`);
