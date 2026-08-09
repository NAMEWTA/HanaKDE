import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveOpenHanakoKnowledgeArtifacts } from "./helpers/openhanako-knowledge-artifacts.ts";

const repositoryRoot = process.cwd();
const changeRoot = resolveOpenHanakoKnowledgeArtifacts(repositoryRoot);
const implementationBaselinePath = path.join(
  changeRoot,
  "implementation-baseline.md",
);
const silverBulletMatrixPath = path.join(
  changeRoot,
  "silverbullet-reference-matrix.md",
);

const REQUIRED_SEAMS = [
  "desktop/preload.cjs",
  "desktop/main.cjs",
  "desktop/src/react/components/PreviewEditor.tsx",
  "server/composition/open-root.ts",
  "server/composition/full-root.ts",
  "server/routes/resource-io.ts",
  "lib/resource-io/resource-io.ts",
  "lib/resource-io/types.ts",
  "scripts/build-server-open.mjs",
  "scripts/smoke-open-server.mjs",
] as const;

const REQUIRED_TOP_LEVEL_DIRECTORIES = [
  "desktop",
  "server",
  "core",
  "lib",
  "shared",
  "tests",
  "packages",
  "scripts",
] as const;

function resolveSilverBulletReferenceRoot(): string {
  const configuredRoot = process.env.SILVERBULLET_REFERENCE_ROOT?.trim();
  const root = configuredRoot ? path.resolve(configuredRoot) : repositoryRoot;
  if (
    configuredRoot &&
    !fs.existsSync(path.join(root, "silverbullet/package.json"))
  ) {
    throw new Error(
      `SILVERBULLET_REFERENCE_ROOT does not contain silverbullet/package.json: ${root}`,
    );
  }
  return root;
}

const silverBulletReferenceRoot = resolveSilverBulletReferenceRoot();

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function parseTableBelow(markdown: string, heading: string): string[][] {
  const headingIndex = markdown.indexOf(heading);
  if (headingIndex < 0) throw new Error(`missing heading: ${heading}`);
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

function collectRegularReferenceFiles(relativeDirectory: string): string[] {
  const absoluteDirectory = path.join(
    silverBulletReferenceRoot,
    relativeDirectory,
  );
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap(
    (entry) => {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const absolutePath = path.join(silverBulletReferenceRoot, relativePath);
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new Error(`${relativePath} must not be a symlink`);
      }
      if (stat.isDirectory()) return collectRegularReferenceFiles(relativePath);
      if (!stat.isFile()) {
        throw new Error(`${relativePath} must be a regular file`);
      }
      return [relativePath];
    },
  );
}

function aggregateReferenceDirectory(relativeDirectory: string): {
  files: number;
  sha256: string;
} {
  const files = collectRegularReferenceFiles(relativeDirectory).sort(
    (left, right) => Buffer.from(left).compare(Buffer.from(right)),
  );
  const manifest = files
    .map((relativePath) => {
      const hash = sha256(
        fs.readFileSync(path.join(silverBulletReferenceRoot, relativePath)),
      );
      return `${hash}  ${relativePath}\n`;
    })
    .join("");
  return { files: files.length, sha256: sha256(manifest) };
}

function runReadOnlyGit(args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

function readPackageContract(): {
  name?: string;
  version?: string;
  engines?: { node?: string };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
} {
  return JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
  );
}

function assertRepositoryFile(relativePath: string): void {
  const absolutePath = path.join(repositoryRoot, relativePath);
  expect(
    fs.existsSync(absolutePath),
    `${relativePath} must exist in the implementation worktree`,
  ).toBe(true);
  const stat = fs.statSync(absolutePath);
  expect(stat.isFile(), `${relativePath} must remain a file`).toBe(true);
}

describe("KW-RULE-PREFLIGHT executable repository contract", () => {
  it("requires the audited commit to be an ancestor and only reports dirty state", () => {
    const baseline = fs.readFileSync(implementationBaselinePath, "utf8");
    const auditedCommit = /\| 审计 HEAD \| `([^`]+)` \|/.exec(baseline)?.[1];
    expect(auditedCommit, "implementation baseline must name an audited HEAD").toBeTruthy();

    const rootResult = runReadOnlyGit(["rev-parse", "--show-toplevel"]);
    expect(rootResult.status, String(rootResult.stderr)).toBe(0);
    expect(path.resolve(String(rootResult.stdout).trim())).toBe(repositoryRoot);

    const ancestorResult = runReadOnlyGit([
      "merge-base",
      "--is-ancestor",
      auditedCommit!,
      "HEAD",
    ]);
    expect(
      ancestorResult.status,
      `audited commit ${auditedCommit} must remain an ancestor of HEAD`,
    ).toBe(0);

    const dirtyResult = runReadOnlyGit([
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]);
    expect(dirtyResult.status, String(dirtyResult.stderr)).toBe(0);
    const dirtyEntries = String(dirtyResult.stdout)
      .split("\n")
      .filter(Boolean);
    if (dirtyEntries.length > 0) {
      console.warn(
        `[knowledge-preflight] dirty worktree warning: ${dirtyEntries.length} entries; no cleanup performed`,
      );
    }
  });

  it("runs on the repository's supported Node 24 line", () => {
    const packageContract = readPackageContract();
    const [major, minor] = process.versions.node.split(".").map(Number);

    expect(packageContract.engines?.node).toBe(">=24.12.0 <25");
    expect(
      major === 24 && minor >= 12,
      `Node ${process.versions.node} is unsupported; use >=24.12.0 <25`,
    ).toBe(true);
  });

  it("matches the audited package identity and exposes the required build gates", () => {
    const packageContract = readPackageContract();

    expect(packageContract).toMatchObject({
      name: "hanako",
      version: "0.416.51",
      scripts: {
        typecheck:
          "tsc --noEmit && tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.test.json",
        "lint:boundary": "node scripts/lint-open-boundary.mjs",
        "build:server:open": "node scripts/build-server-open.mjs",
        "smoke:server:open": "node scripts/smoke-open-server.mjs",
      },
    });
    expect(packageContract.dependencies?.["better-sqlite3"]).toBeTruthy();
  });

  it("keeps every audited implementation seam and top-level repository area present", () => {
    for (const relativePath of REQUIRED_SEAMS) {
      assertRepositoryFile(relativePath);
    }
    for (const relativePath of REQUIRED_TOP_LEVEL_DIRECTORIES) {
      const absolutePath = path.join(repositoryRoot, relativePath);
      expect(
        fs.existsSync(absolutePath),
        `${relativePath}/ must exist in the implementation worktree`,
      ).toBe(true);
      const stat = fs.statSync(absolutePath);
      expect(stat.isDirectory(), `${relativePath}/ must remain a directory`).toBe(true);
    }
  });

  it("keeps the local SilverBullet reference auditable without executing it as runtime code", () => {
    const packagePath = path.join(
      silverBulletReferenceRoot,
      "silverbullet/package.json",
    );
    const licensePath = path.join(
      silverBulletReferenceRoot,
      "silverbullet/LICENSE.md",
    );
    expect(
      fs.existsSync(packagePath),
      "SilverBullet reference snapshot is required; set SILVERBULLET_REFERENCE_ROOT to a repository root containing silverbullet/package.json",
    ).toBe(true);
    expect(
      fs.existsSync(licensePath),
      "SilverBullet reference snapshot must include silverbullet/LICENSE.md",
    ).toBe(true);
    expect(fs.statSync(packagePath).isFile()).toBe(true);
    expect(fs.statSync(licensePath).isFile()).toBe(true);
    assertRepositoryFile(path.relative(repositoryRoot, silverBulletMatrixPath));
    expect(
      fs.readdirSync(path.join(silverBulletReferenceRoot, "silverbullet")).length,
      "silverbullet/ must not be an empty placeholder",
    ).toBeGreaterThan(2);

    const matrix = fs.readFileSync(silverBulletMatrixPath, "utf8");
    const expectedFiles = parseTableBelow(matrix, "### 单文件 SHA-256");
    const expectedDirectories = parseTableBelow(
      matrix,
      "### 目录聚合 SHA-256",
    );
    expect(expectedFiles).toHaveLength(8);
    expect(expectedDirectories).toHaveLength(3);
    expectedFiles.forEach(([relativePath, expectedHash]) => {
      expect(
        sha256(
          fs.readFileSync(
            path.join(silverBulletReferenceRoot, relativePath),
          ),
        ),
        relativePath,
      ).toBe(expectedHash);
    });
    expectedDirectories.forEach(
      ([relativeDirectory, expectedCount, expectedHash]) => {
        expect(
          aggregateReferenceDirectory(relativeDirectory.replace(/\/$/, "")),
          relativeDirectory,
        ).toEqual({
          files: Number(expectedCount),
          sha256: expectedHash,
        });
      },
    );
  });

  it("loads better-sqlite3 and proves SQLite FTS5 with a real in-memory query", () => {
    const database = new Database(":memory:");
    try {
      database.exec(
        "CREATE VIRTUAL TABLE documents USING fts5(body); INSERT INTO documents(body) VALUES ('open hanako knowledge');",
      );
      const rows = database
        .prepare("SELECT body FROM documents WHERE documents MATCH ?")
        .all('"hanako knowledge"');

      expect(rows).toEqual([{ body: "open hanako knowledge" }]);
    } finally {
      database.close();
    }
  });
});
