import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const root = path.dirname(new URL(import.meta.url).pathname);
fs.mkdirSync(path.join(root, "assets"), { recursive: true });
await build({
  entryPoints: [path.join(root, "src/ui/page.tsx")],
  outfile: path.join(root, "assets/page.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  sourcemap: false,
  minify: true,
  absWorkingDir: root,
  alias: {
    "@hana/plugin-sdk": path.resolve(root, "../../packages/plugin-sdk"),
    "@hana/plugin-components": path.resolve(root, "../../packages/plugin-components"),
  },
});
