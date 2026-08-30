import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(root, "assets");

await build({
  entryPoints: [path.join(root, "src/ui/page.tsx")],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: ["es2022"],
  outfile: path.join(assets, "page.js"),
  sourcemap: false,
  minify: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  jsx: "automatic",
  logLevel: "warning"
});

for (const required of ["page.js", "page.css"]) {
  const file = path.join(assets, required);
  if (!fs.existsSync(file) || fs.statSync(file).size < 1_000) {
    throw new Error(`Missing or incomplete UI asset ${required}`);
  }
}

console.log(`dossiers UI assets ready (${fs.statSync(path.join(assets, "page.js")).size} bytes JS)`);
