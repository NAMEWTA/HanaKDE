import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");
const changeRoot = path.join(
  repoRoot,
  "speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace",
);
const matrixPath = path.join(changeRoot, "silverbullet-reference-matrix.md");

function resolveReferenceRoot(): string {
  const configuredRoot = process.env.SILVERBULLET_REFERENCE_ROOT?.trim();
  const root = configuredRoot ? path.resolve(configuredRoot) : repoRoot;
  if (configuredRoot && !existsSync(path.join(root, "silverbullet/package.json"))) {
    throw new Error(
      `SILVERBULLET_REFERENCE_ROOT does not contain silverbullet/package.json: ${root}`,
    );
  }
  return root;
}

const referenceRoot = resolveReferenceRoot();
const snapshotAvailable = existsSync(
  path.join(referenceRoot, "silverbullet/package.json"),
);
const snapshotRequired = process.env.SILVERBULLET_REFERENCE_REQUIRED === "1";
if (snapshotRequired && !snapshotAvailable) {
  throw new Error(
    "SilverBullet reference snapshot is required but unavailable; set SILVERBULLET_REFERENCE_ROOT to a repository root containing silverbullet/package.json",
  );
}
const productionDirectories = [
  "build",
  "cli",
  "core",
  "desktop",
  "examples",
  "hub",
  "lib",
  "packages",
  "plugins",
  "scripts",
  "server",
  "shared",
  "skills2set",
] as const;
const productionTextExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".mjs",
  ".ts",
  ".tsx",
]);
const excludedRuntimeDirectories = new Set([
  ".build",
  ".cache",
  "coverage",
  "dist",
  "node_modules",
]);
const silverBulletRuntimeReference =
  /@silverbulletmd\/silverbullet|(?:^|[^A-Za-z0-9_-])silverbullet[\\/]/i;

const expectedFiles = {
  "silverbullet/client/codemirror/editor_state.ts":
    "d10ae7e14acc1a08160fa1189eb6ca3341d86f19362fac7b6b4b84193c9268fc",
  "silverbullet/client/codemirror/wiki_link.ts":
    "cb8c94a6140b4c1a6ab0aec0927628a8273ed0a36ce4fa99a0472868087b2a18",
  "silverbullet/client/codemirror/frontmatter.ts":
    "67c200ef9a6a1456b094177782bfd0557013420c848e3a572670662d623a0eb4",
  "silverbullet/client/codemirror/footnote.ts":
    "3a8d1ee1753facf03a7d70db31d2b538223ae7b7ed83c00e47807247aa09fd98",
  "silverbullet/client/codemirror/markdown_enter.ts":
    "4a36918604d69ee89ffc8f6f2138f2a0ec2d62b40c93923c01112ca7e65e7822",
  "silverbullet/client/codemirror/editor_paste.ts":
    "3065347228c4816f58bb92dec907c3e48fefd80d136db01b9002c7bc32b2a8b5",
  "silverbullet/package.json":
    "74107b19514c8885a2ef2e9272c1bcb857aba19f6a6bd277e0430703244954ea",
  "silverbullet/LICENSE.md":
    "ccf525a3b5c9ac8d843e118932036e6517d4d603f9ff3e474522b632c3996c65",
} as const;

const expectedDirectories = {
  "silverbullet/client/markdown_parser": {
    files: 13,
    sha256: "b149b4b80e76e33cdc3fa4fa8153a53533c1f692b47a972387f1683231435d07",
  },
  "silverbullet/client/spaces": {
    files: 11,
    sha256: "f9418090b736dfa7e912d5024cc99e91ad5963147a04161a7e5ebb5ae42b00b1",
  },
  "silverbullet/plugs/index": {
    files: 57,
    sha256: "b34b8d7ee9242798e8eba7a5cfbe157fbb4dcac17ae5c93e74cb4bd4e50e3184",
  },
} as const;

const expectedCapabilities = [
  [
    "Editor state/compartment",
    "silverbullet/client/codemirror/editor_state.ts",
    "extension 分层与生命周期",
    "desktop/src/react/editor/",
    "思路/小段适配",
  ],
  [
    "Wikilink",
    "silverbullet/client/codemirror/wiki_link.ts",
    "decoration、completion、navigation command 拆分",
    "Knowledge link field/commands",
    "思路/小段适配",
  ],
  [
    "Frontmatter",
    "silverbullet/client/codemirror/frontmatter.ts",
    "编辑投影边界",
    "frontmatter projection/field",
    "思路；保真算法独立",
  ],
  [
    "Footnote",
    "silverbullet/client/codemirror/footnote.ts",
    "定义/引用交互",
    "knowledge footnote field",
    "思路/小段适配",
  ],
  [
    "Enter commands",
    "silverbullet/client/codemirror/markdown_enter.ts",
    "transaction case matrix",
    "knowledge enter commands",
    "小段适配允许",
  ],
  [
    "Paste",
    "silverbullet/client/codemirror/editor_paste.ts",
    "paste interception ordering",
    "Knowledge attachment policy",
    "思路；文件协议独立",
  ],
  [
    "Markdown parser",
    "silverbullet/client/markdown_parser/",
    "parser/editor/index 分离",
    "Markdown Knowledge IR",
    "思路；不得引入 runtime",
  ],
  [
    "Space",
    "silverbullet/client/spaces/",
    "受控文件空间责任划分",
    "SourceRegistry/ResourceIO adapter",
    "只研究接口边界",
  ],
  [
    "Index",
    "silverbullet/plugs/index/",
    "extractor/index/query 分层",
    "source-partitioned index",
    "只研究模块化",
  ],
] as const;

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function collectProductionTextFiles(
  absoluteDirectory: string,
  relativeDirectory: string,
): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedRuntimeDirectories.has(entry.name)) {
      continue;
    }
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    const absolutePath = path.join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectProductionTextFiles(absolutePath, relativePath));
    } else if (
      entry.isFile() &&
      productionTextExtensions.has(path.extname(entry.name))
    ) {
      files.push(relativePath);
    }
  }

  return files;
}

function productionRuntimeFiles(): string[] {
  const rootEntries = readdirSync(repoRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        productionTextExtensions.has(path.extname(entry.name)),
    )
    .map((entry) => entry.name);
  const moduleFiles = productionDirectories.flatMap((relativeDirectory) =>
    collectProductionTextFiles(
      path.join(repoRoot, relativeDirectory),
      relativeDirectory,
    ),
  );
  return [...rootEntries, ...moduleFiles];
}

function collectRegularFiles(repoRelativeDirectory: string): string[] {
  const absoluteDirectory = path.join(referenceRoot, repoRelativeDirectory);
  const files: string[] = [];

  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.posix.join(repoRelativeDirectory, entry.name);
    const absolutePath = path.join(referenceRoot, relativePath);
    const stat = lstatSync(absolutePath);

    expect(stat.isSymbolicLink(), `${relativePath} must not be a symlink`).toBe(false);
    if (stat.isDirectory()) {
      files.push(...collectRegularFiles(relativePath));
    } else {
      expect(stat.isFile(), `${relativePath} must be a regular file`).toBe(true);
      files.push(relativePath);
    }
  }

  return files;
}

function aggregateDirectory(repoRelativeDirectory: string): {
  files: number;
  sha256: string;
} {
  const files = collectRegularFiles(repoRelativeDirectory).sort((left, right) =>
    Buffer.from(left).compare(Buffer.from(right)),
  );
  const manifest = files
    .map((relativePath) => {
      const fileHash = sha256(readFileSync(path.join(referenceRoot, relativePath)));
      return `${fileHash}  ${relativePath}\n`;
    })
    .join("");

  return { files: files.length, sha256: sha256(manifest) };
}

function parseTableBelow(markdown: string, heading: string): string[][] {
  const headingIndex = markdown.indexOf(heading);
  expect(headingIndex, `missing matrix heading: ${heading}`).toBeGreaterThanOrEqual(0);
  const rows: string[][] = [];

  for (const line of markdown.slice(headingIndex + heading.length).split("\n")) {
    if (!line.startsWith("|")) {
      if (rows.length > 0) break;
      continue;
    }
    const cells = line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim().replaceAll("`", ""));
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    rows.push(cells);
  }

  return rows.slice(1);
}

describe("SilverBullet reference integrity", () => {
  it.skipIf(!snapshotAvailable)(
    "pins the exact package identity and MIT license",
    () => {
      const matrix = readFileSync(matrixPath, "utf8");
      const packageJson = JSON.parse(
        readFileSync(
          path.join(referenceRoot, "silverbullet/package.json"),
          "utf8",
        ),
      ) as {
        name: string;
        version: string;
        engines: { node: string };
      };
      const license = readFileSync(
        path.join(referenceRoot, "silverbullet/LICENSE.md"),
        "utf8",
      );
      expect(packageJson).toMatchObject({
        name: "@silverbulletmd/silverbullet",
        version: "2.9.0",
        engines: { node: ">=24.13.0" },
      });
      expect(license).toContain("Copyright 2022, Zef Hemel");
      expect(license).toContain("Permission is hereby granted, free of charge");
      expect(license).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
      expect(parseTableBelow(matrix, "## Snapshot")).toEqual([
        ["仓库内位置", "silverbullet/（被 .gitignore 排除，不作为运行依赖）"],
        ["package", "@silverbulletmd/silverbullet"],
        ["版本", "2.9.0"],
        ["Node 要求", ">=24.13.0"],
        ["许可证", "MIT，Copyright 2022 Zef Hemel"],
        [
          "Git provenance",
          "本地目录不含独立 .git；使用选定文件 SHA-256 固定 snapshot",
        ],
      ]);
    },
  );

  it.skipIf(!snapshotAvailable)(
    "independently verifies every pinned file and directory aggregate",
    () => {
      const matrix = readFileSync(matrixPath, "utf8");

      for (const [relativePath, expectedHash] of Object.entries(expectedFiles)) {
        expect(
          sha256(readFileSync(path.join(referenceRoot, relativePath))),
          relativePath,
        ).toBe(expectedHash);
      }
      for (const [relativeDirectory, expected] of Object.entries(
        expectedDirectories,
      )) {
        expect(aggregateDirectory(relativeDirectory), relativeDirectory).toEqual(
          expected,
        );
      }
      expect(parseTableBelow(matrix, "### 单文件 SHA-256")).toEqual(
        Object.entries(expectedFiles),
      );
      expect(parseTableBelow(matrix, "### 目录聚合 SHA-256")).toEqual(
        Object.entries(expectedDirectories).map(
          ([relativeDirectory, expected]) => [
            `${relativeDirectory}/`,
            String(expected.files),
            expected.sha256,
          ],
        ),
      );
    },
  );

  it("keeps every capability restricted to its audited adoption and HanaKDE landing", () => {
    const matrix = readFileSync(matrixPath, "utf8");
    expect(parseTableBelow(matrix, "## 能力矩阵")).toEqual(expectedCapabilities);
    expect(matrix).toContain("不作为运行依赖");
    expect(matrix).toContain("禁止移植 Preact UI、Rust Server、Space Lua、plugin runtime");
  });

  it("keeps SilverBullet out of production sources and runtime manifests", async () => {
    for (const relativePath of productionRuntimeFiles()) {
      let content = readFileSync(path.join(repoRoot, relativePath), "utf8");
      if (relativePath === "vitest.config.js") {
        const allowedDiscoveryExclude = '"silverbullet/**"';
        expect(content.split(allowedDiscoveryExclude)).toHaveLength(2);
        content = content.replace(allowedDiscoveryExclude, '""');
      }
      if (relativePath === "eslint.config.js") {
        const allowedLintExclude = "'silverbullet/**'";
        expect(content.split(allowedLintExclude)).toHaveLength(2);
        content = content.replace(allowedLintExclude, "''");
      }
      expect(content, relativePath).not.toMatch(silverBulletRuntimeReference);
    }

    const vitestConfig = (await import("../vitest.config.js")).default;
    expect(vitestConfig.test?.exclude).toContain("silverbullet/**");
    const eslintConfig = (await import("../eslint.config.js")).default;
    expect(eslintConfig[0]?.ignores).toContain("silverbullet/**");
  });

  it("publishes a concise third-party notice without claiming code adoption", () => {
    const notice = readFileSync(path.join(repoRoot, "THIRD_PARTY_NOTICES.md"), "utf8");

    expect(notice).toContain("@silverbulletmd/silverbullet");
    expect(notice).toContain("2.9.0");
    expect(notice).toContain("MIT");
    expect(notice).toContain("Copyright 2022 Zef Hemel");
    expect(notice).toContain("silverbullet/LICENSE.md");
    expect(notice).toContain(
      "speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/silverbullet-reference-matrix.md",
    );
    expect(notice).toContain("未作为运行依赖");
    expect(notice).toContain("禁止整体移植");
    expect(notice).toContain(
      "https://github.com/silverbulletmd/silverbullet/blob/2.9.0/LICENSE.md",
    );
    expect(notice).not.toMatch(/已(?:采用|复用|复制).*SilverBullet/);
  });
});
