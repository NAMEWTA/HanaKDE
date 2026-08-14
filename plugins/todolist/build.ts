import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(root, "assets");
fs.mkdirSync(assets, { recursive: true });

async function buildReact(): Promise<boolean> {
  let esbuild: typeof import("esbuild");
  try {
    esbuild = await import("esbuild");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ERR_MODULE_NOT_FOUND" || /Cannot find package ['"]esbuild['"]/.test(String(error))) return false;
    throw error;
  }
  await esbuild.build({
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
  return true;
}

if (!(await buildReact())) {
  const source = fs.readFileSync(path.join(root, "src/ui/browser-app.ts"), "utf8")
    .replace(/^\/\/ @ts-nocheck\s*/u, "")
    .replace("export function mountTodoApp", "function mountTodoApp");
  fs.writeFileSync(path.join(assets, "page.js"), `${source}\nmountTodoApp(document.getElementById("root"));\n`, "utf8");
}

for (const required of ["page.js", "page.css"]) {
  const file = path.join(assets, required);
  if (!fs.existsSync(file) || fs.statSync(file).size < 100) throw new Error(`Missing UI asset ${required}`);
}
console.log(`todolist UI assets ready (${fs.statSync(path.join(assets, "page.js")).size} bytes JS)`);
