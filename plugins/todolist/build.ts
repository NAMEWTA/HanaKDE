import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(root, "assets");
fs.mkdirSync(assets, { recursive: true });

async function buildReact(): Promise<void> {
  await build({
    entryPoints: [path.join(root, "src/ui/page.tsx")],
    bundle: true,
    platform: "browser",
    format: "esm",
    target: ["es2022"],
    outfile: path.join(assets, "page.js"),
    sourcemap: false,
    minify: false,
    jsx: "automatic",
    logLevel: "warning",
  });
}

await buildReact();

for (const required of ["page.js", "page.css"]) {
  const file = path.join(assets, required);
  if (!fs.existsSync(file) || fs.statSync(file).size < 100) throw new Error(`Missing UI asset ${required}`);
}
console.log(`todolist UI assets ready (${fs.statSync(path.join(assets, "page.js")).size} bytes JS)`);
