import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..", "..");
const stageParent = fs.mkdtempSync(path.join(os.tmpdir(), "hana-dossiers-package-"));
const stage = path.join(stageParent, "dossiers");

function copy(relative) {
  const source = path.join(root, relative);
  const target = path.join(stage, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function files(dir, suffix) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => `${dir}/${entry.name}`)
    .sort();
}

try {
  for (const relative of ["manifest.json", "package.json", "README.md", "assets"]) copy(relative);
  const entries = ["index.ts", ...files("routes", ".ts"), ...files("tools", ".ts")];
  for (const relative of entries) {
    const output = relative.replace(/\.ts$/u, ".js");
    const outfile = path.join(stage, output);
    fs.mkdirSync(path.dirname(outfile), { recursive: true });
    await build({
      entryPoints: [path.join(root, relative)],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      target: ["node24"],
      sourcemap: false,
      minify: false,
      external: ["better-sqlite3", "yauzl"],
      logLevel: "warning"
    });
  }

  for (const dependency of ["better-sqlite3", "bindings", "file-uri-to-path", "yauzl", "fd-slicer", "buffer-crc32", "pend"]) {
    const source = path.join(root, "..", "..", "node_modules", dependency);
    assert.equal(fs.existsSync(source), true, `missing production dependency ${dependency}`);
    const target = path.join(stage, "node_modules", dependency);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true });
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(stage, "manifest.json"), "utf8"));
  const pkg = JSON.parse(fs.readFileSync(path.join(stage, "package.json"), "utf8"));
  assert.equal(manifest.id, "dossiers");
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.contributes.page.route, "/page");
  assert.deepEqual(manifest.ui.hostCapabilities, ["resource.pick"]);
  assert.deepEqual([...manifest.capabilities].sort(), ["resource.read", "resource.search", "resource.write"]);

  for (const relative of entries.map((entry) => entry.replace(/\.ts$/u, ".js"))) {
    const module = await import(`${pathToFileURL(path.join(stage, relative)).href}?smoke=${Date.now()}-${Math.random()}`);
    if (relative.startsWith("tools/")) {
      assert.equal(typeof module.name, "string", `${relative} must export a tool name`);
      assert.equal(typeof module.description, "string", `${relative} must export a description`);
      assert.equal(typeof module.execute, "function", `${relative} must export execute`);
      assert.equal(typeof module.parameters, "object", `${relative} must export parameters`);
    }
  }

  const productBundles = entries.map((entry) => fs.readFileSync(path.join(stage, entry.replace(/\.ts$/u, ".js")), "utf8")).join("\n")
    + fs.readFileSync(path.join(stage, "assets/page.js"), "utf8");
  assert.doesNotMatch(productBundles, /(?:from\s*|import\s*\()["']@hana\/plugin-(?:runtime|sdk|components)/u, "production entries must not contain unresolved workspace SDK imports");
  assert.doesNotMatch(productBundles, /C:[\\/]Data[\\/]01-Code[\\/]HanaKDE/iu, "production entries must not contain repository paths");
  assert.doesNotMatch(productBundles, /pluginIframeTicket.{0,80}(?:fetch|assets)/isu, "iframe tickets must not authenticate assets or API fetches");
  assert.match(productBundles, /X-Hana-Plugin-Surface-Session/u, "browser bundle must use Hana surface-session API authentication");
  assert.doesNotMatch(productBundles, /\bmodel\.sample\b|\bsampleText\s*\(/u, "plugin must not call a model");
  assert.doesNotMatch(productBundles, /(?:\bfetch|network\.fetch)\s*\(\s*["']https?:\/\//iu, "plugin product must not call external network endpoints");

  console.log(`standalone package smoke passed: ${entries.length} bundled entries, ${files("tools", ".ts").length} tools`);
} finally {
  fs.rmSync(stageParent, { recursive: true, force: true });
}
