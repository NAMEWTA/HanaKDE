import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(root, "assets");
fs.mkdirSync(assets, { recursive: true });

await build({
  entryPoints: [path.join(root, "src/ui/main.tsx")],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: ["es2022"],
  outfile: path.join(assets, "app.js"),
  sourcemap: false,
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  jsx: "automatic",
  logLevel: "warning",
});

for (const required of ["app.js", "app.css"]) {
  const file = path.join(assets, required);
  if (!fs.existsSync(file) || fs.statSync(file).size < 100) {
    throw new Error(`Missing Markdown WeChat UI asset ${required}`);
  }
}

console.log(`markdown-wechat UI ready (${fs.statSync(path.join(assets, "app.js")).size} bytes JS)`);
