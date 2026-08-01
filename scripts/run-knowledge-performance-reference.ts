import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  REFERENCE_SCENARIO_IDS,
  runReferenceBenchmark,
  validatePerformanceEvidence,
  type PerformanceScenarioId,
  type ReferenceBaseline,
  type ReferenceMachine,
} from "../tests/fixtures/knowledge-workspace/performance-budget.ts";
import {
  createKnowledgeProductPerformanceAdapters,
} from "../tests/fixtures/knowledge-workspace/product-performance-adapters.ts";

type CliOptions = {
  baselinePath: string | null;
  establish: boolean;
  commit: string | null;
};

export async function runKnowledgePerformanceReference(argv = process.argv.slice(2)): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(usage());
    return;
  }
  const options = parseArgs(argv);
  assertReferenceEnvironment();
  const hanaHome = requireAbsoluteEnvironmentPath("HANA_HOME");
  const headCommit = gitCommitForCleanWorktree();
  const commit = resolveAuditedCommit(options.commit, headCommit);
  const platform = `${process.platform}-${process.arch}`;
  const machine = readMachine();
  const baseline = options.establish
    ? { mode: "establish" as const }
    : readBaseline(options.baselinePath!, machine);
  const scratchParent = fs.mkdtempSync(path.join(hanaHome, "knowledge-reference-"));
  try {
    const result = await runReferenceBenchmark({
      hanaHome,
      commit,
      platform,
      machine,
      environment: {
        productionBuild: true,
        devtools: false,
        debugLogging: false,
      },
      baseline,
      adapters: createKnowledgeProductPerformanceAdapters({ scratchParent }),
    });
    process.stdout.write(`${JSON.stringify({
      evidencePath: result.evidencePath,
      pass: result.evidence.pass,
      baselineMode: result.evidence.baselineMode,
    })}\n`);
    if (result.evidence.pass !== true) process.exitCode = 1;
  } finally {
    fs.rmSync(scratchParent, { recursive: true, force: true });
  }
}

function parseArgs(argv: readonly string[]): CliOptions {
  let baselinePath: string | null = null;
  let establish = false;
  let commit: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--establish") establish = true;
    else if (arg === "--baseline") baselinePath = requiredValue(argv, ++index, arg);
    else if (arg === "--commit") commit = requiredValue(argv, ++index, arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (establish === (baselinePath !== null)) {
    throw new Error("Choose exactly one of --establish or --baseline <evidence.json>");
  }
  if (commit !== null && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(commit)) {
    throw new Error("--commit must be a safe evidence identifier");
  }
  return { baselinePath, establish, commit };
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function assertReferenceEnvironment(): void {
  if (!/^v24(?:\.|$)/u.test(process.version)) throw new Error("Reference benchmark requires Node 24");
  if (process.env.NODE_ENV !== "production") throw new Error("Reference benchmark requires NODE_ENV=production");
  if (process.env.HANA_DEBUG === "1") throw new Error("Reference benchmark requires debug logging disabled");
  if (process.env.HANA_REFERENCE_STORAGE !== "ssd") {
    throw new Error("Set HANA_REFERENCE_STORAGE=ssd only after verifying the scratch volume is SSD-backed");
  }
}

function requireAbsoluteEnvironmentPath(name: string): string {
  const value = process.env[name];
  if (!value || !path.isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  fs.mkdirSync(value, { recursive: true, mode: 0o700 });
  return value;
}

function gitCommitForCleanWorktree(): string {
  const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  if (status.trim()) throw new Error("Reference evidence requires a clean worktree");
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

export function resolveAuditedCommit(requestedCommit: string | null, headCommit: string): string {
  if (requestedCommit === null) return headCommit;
  const matchesHead = requestedCommit === headCommit || headCommit.startsWith(requestedCommit);
  if (!matchesHead) throw new Error("--commit must identify the clean worktree HEAD");
  return headCommit;
}

function readMachine(): ReferenceMachine {
  const cpus = os.cpus();
  const filesystem = process.env.HANA_REFERENCE_FILESYSTEM;
  if (!filesystem || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(filesystem)) {
    throw new Error("HANA_REFERENCE_FILESYSTEM must name the verified filesystem (for example apfs, ntfs, or ext4)");
  }
  return {
    cpu: cpus[0]?.model.trim() || "unknown-cpu",
    logicalCpuCount: cpus.length,
    memoryBytes: os.totalmem(),
    os: `${process.platform}-${os.release()}`,
    filesystem,
    storage: "ssd",
    node: process.version,
  };
}

function readBaseline(filePath: string, machine: ReferenceMachine): ReferenceBaseline {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8")) as Record<string, unknown>;
  const validation = validatePerformanceEvidence(parsed);
  if (validation.ok === false) throw new Error(`Invalid baseline evidence: ${validation.errors.join("; ")}`);
  if (parsed.pass !== true) throw new Error("Baseline evidence must be passing");
  if (JSON.stringify(parsed.machine) !== JSON.stringify(machine)) {
    throw new Error("Baseline evidence must come from the same reference runner");
  }
  const scenarios = parsed.scenarios as Array<{
    id: PerformanceScenarioId;
    measurement: { p95Ms: number; peakRssBytes: number };
  }>;
  const values = Object.fromEntries(scenarios.map((scenario) => [
    scenario.id,
    {
      p95Ms: scenario.measurement.p95Ms,
      peakRssBytes: scenario.measurement.peakRssBytes,
    },
  ])) as Record<PerformanceScenarioId, { p95Ms: number; peakRssBytes: number }>;
  if (REFERENCE_SCENARIO_IDS.some((id) => values[id] === undefined)) {
    throw new Error("Baseline evidence is missing a reference scenario");
  }
  return {
    mode: "compare",
    commit: String(parsed.commit),
    fixtureHash: String(parsed.fixtureHash),
    machine,
    status: "passed",
    selection: "latest-passing-same-runner",
    values,
  };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run benchmark:knowledge:reference -- --establish [--commit <HEAD>]",
    "  npm run benchmark:knowledge:reference -- --baseline <evidence.json> [--commit <HEAD>]",
    "",
    "Required environment: NODE_ENV=production, HANA_HOME=<absolute path>,",
    "HANA_REFERENCE_STORAGE=ssd, HANA_REFERENCE_FILESYSTEM=<apfs|ntfs|ext4|...>.",
    "The worktree must be clean; --commit, when supplied, must identify HEAD.",
    "",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runKnowledgePerformanceReference().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
