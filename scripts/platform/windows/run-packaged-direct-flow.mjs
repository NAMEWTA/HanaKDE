import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import JSZip from "jszip";

import { createKnowledgeLaunchConfig } from "../../../tests/knowledge-workspace-e2e/fixtures/server-fixture.ts";
import { createKnowledgeWorkspaceSandbox } from "../../../tests/knowledge-workspace-e2e/fixtures/workspace-fixture.ts";
import {
  ENGINE_TOOL_HARNESS_COMPLETE,
  ENGINE_TOOL_HARNESS_CONTENT,
  ENGINE_TOOL_HARNESS_MODEL_ID,
  ENGINE_TOOL_HARNESS_PROVIDER_ID,
  ENGINE_TOOL_HARNESS_REL_PATH,
} from "../../../tests/knowledge-workspace-e2e/fixtures/engine-tool-harness.ts";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const WINDOWS_CHROMIUM_SWITCHES = [
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
];
export const PACKAGED_CHAT_EDITOR_SELECTOR = '#inputBox[contenteditable="true"]:visible';
const PACKAGED_CHAT_EDITOR_TIMEOUT_MS = 90_000;

export function assertPackagedFlowPlatform(platform = process.platform) {
  if (platform !== "win32") {
    throw new Error(`[windows-packaged-flow] requires win32, got ${platform}`);
  }
}

function optionValue(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`[windows-packaged-flow] ${name} requires a value`);
  }
  return value;
}

export function parsePackagedFlowOptions(argv) {
  const installInput = optionValue(argv, "--install");
  if (!installInput) throw new Error("[windows-packaged-flow] --install is required");
  const installRoot = path.resolve(installInput);
  const executablePath = path.join(installRoot, "HanaKDE.exe");
  if (!fsSync.statSync(executablePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error("[windows-packaged-flow] --install must contain HanaKDE.exe");
  }
  const version = optionValue(argv, "--version") ?? "0.446.6";
  if (!VERSION_PATTERN.test(version)) {
    throw new Error("[windows-packaged-flow] version must be a semantic artifact version");
  }
  return { installRoot, executablePath, version };
}

export function resolvePackagedPiAiPath({ hanaHome, version, arch = "x64" }) {
  const resolvedHome = path.resolve(hanaHome);
  if (!VERSION_PATTERN.test(version) || !/^(?:x64|arm64)$/.test(arch)) {
    throw new Error("[windows-packaged-flow] invalid package artifact coordinates");
  }
  const resolved = path.join(
    resolvedHome,
    "artifacts",
    "server",
    `${version}-win32-${arch}`,
    "node_modules",
    "@earendil-works",
    "pi-ai",
    "dist",
    "index.js",
  );
  if (!resolved.startsWith(`${resolvedHome}${path.sep}`)) {
    throw new Error("[windows-packaged-flow] package provider escaped HANA_HOME");
  }
  return resolved;
}

export function assertPackagedFlowReceipt(receipt) {
  const required = [
    ["appLaunched", receipt?.appLaunched],
    ["healthReady", receipt?.healthReady],
    ["workspace", receipt?.workspace],
    ["office", receipt?.office],
    ["agent", receipt?.agent],
    ["at", receipt?.at],
    ["cleanup.appStopped", receipt?.cleanup?.appStopped],
    ["cleanup.serverStopped", receipt?.cleanup?.serverStopped],
    ["cleanup.sandboxDisposed", receipt?.cleanup?.sandboxDisposed],
  ];
  const failed = required.find(([, value]) => value !== true);
  if (failed) throw new Error(`[windows-packaged-flow] incomplete receipt: ${failed[0]}`);
  return receipt;
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error("[windows-packaged-flow] failed to reserve loopback port");
  return port;
}

async function waitForFile(file, child, predicate = () => true, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`packaged app exited before ${path.basename(file)} (${child.exitCode ?? child.signalCode})`);
    }
    try {
      const value = JSON.parse(await fs.readFile(file, "utf8"));
      if (predicate(value)) return value;
    } catch {
      // Atomic marker writers may briefly leave the file absent or incomplete.
    }
    await sleep(100);
  }
  const diagnosticDir = path.join(path.dirname(file), "diagnostics", "desktop-launch");
  let diagnostics = "";
  try {
    const names = await fs.readdir(diagnosticDir);
    diagnostics = (await Promise.all(names.map(async (name) => (
      `${name}:\n${await fs.readFile(path.join(diagnosticDir, name), "utf8")}`
    )))).join("\n").slice(-12_000);
  } catch {
    // The app may have failed before the diagnostic directory was created.
  }
  throw new Error(`timed out waiting for ${file}${diagnostics ? `\n[desktop diagnostics]\n${diagnostics}` : ""}`);
}

async function waitFor(predicate, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}`);
}

function apiFetch(serverInfo, pathname, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${serverInfo.token}`);
  return fetch(`http://127.0.0.1:${serverInfo.port}${pathname}`, { ...init, headers });
}

async function json(response, label) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${label} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function writeExpected(serverInfo, relativePath, content, encoding, expectedVersion, reason) {
  return json(await apiFetch(serverInfo, "/api/resource-io/write-expected-version", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: { sourceKey: "main", relativePath },
      content,
      encoding,
      expectedVersion,
      reason,
      operationId: randomUUID(),
    }),
  }), `write ${relativePath}`);
}

async function search(serverInfo, query) {
  return json(await apiFetch(serverInfo, "/api/knowledge-workspace/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: 20 }),
  }), `search ${query}`);
}

async function replaceDocxText(source, before, after) {
  const archive = await JSZip.loadAsync(source);
  const document = archive.file("word/document.xml");
  if (!document) throw new Error("DOCX fixture is missing word/document.xml");
  const xml = await document.async("string");
  if (!xml.includes(before)) throw new Error(`DOCX fixture is missing ${before}`);
  archive.file("word/document.xml", xml.replace(before, after));
  return archive.generateAsync({ type: "nodebuffer" });
}

async function runOfficeFlow(serverInfo, sandbox) {
  await waitFor(async () => {
    const status = await json(await apiFetch(serverInfo, "/api/knowledge-workspace/index/status?sourceKey=main"), "index status");
    return status?.health?.state === "ready";
  }, "initial main index");
  const original = await fs.readFile(path.resolve("tests/fixtures/document-extract/sample.docx"));
  const revised = await replaceDocxText(original, "Quarterly Notes", "Revised Forecast");
  await fs.writeFile(path.join(sandbox.mainSource, "Quarterly.docx"), original);
  await json(await apiFetch(serverInfo, "/api/knowledge-workspace/index/main/rebuild", { method: "POST" }), "main rebuild");
  await waitFor(async () => JSON.stringify(await search(serverInfo, "Quarterly Notes")).includes("Quarterly.docx"), "initial Office search");
  const stat = await json(await apiFetch(serverInfo, "/api/resource-io/stat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: { sourceKey: "main", relativePath: "Quarterly.docx" } }),
  }), "Office stat");
  await writeExpected(serverInfo, "Quarterly.docx", revised.toString("base64"), "base64", stat.version, "windows_packaged_office_edit");
  await waitFor(async () => JSON.stringify(await search(serverInfo, "Revised Forecast")).includes("Quarterly.docx"), "revised Office search");
  const current = await json(await apiFetch(serverInfo, "/api/resource-io/stat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: { sourceKey: "main", relativePath: "Quarterly.docx" } }),
  }), "revised Office stat");
  await writeExpected(serverInfo, "Quarterly.docx", original.toString("base64"), "base64", current.version, "windows_packaged_office_restore");
  await waitFor(async () => JSON.stringify(await search(serverInfo, "Quarterly Notes")).includes("Quarterly.docx"), "restored Office search");
  if (JSON.stringify(await search(serverInfo, "Revised Forecast")).includes("Quarterly.docx")) {
    throw new Error("restored Office search retained stale text");
  }
  if ((await fs.readdir(sandbox.mainSource)).includes("Quarterly.md")) {
    throw new Error("Office flow created a derived Markdown file");
  }
}

async function runAgentFlow(serverInfo, sandbox, page) {
  await json(await apiFetch(serverInfo, "/api/models/set", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelId: ENGINE_TOOL_HARNESS_MODEL_ID, provider: ENGINE_TOOL_HARNESS_PROVIDER_ID }),
  }), "Engine tool harness model selection");
  await page.locator('[data-tab="chat"]').click();
  const editor = page.locator(PACKAGED_CHAT_EDITOR_SELECTOR).last();
  await editor.waitFor({ state: "visible", timeout: PACKAGED_CHAT_EDITOR_TIMEOUT_MS });
  await editor.fill("Create the deterministic Agent History fixture.");
  await editor.press("Enter");
  await page.getByText(ENGINE_TOOL_HARNESS_COMPLETE, { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await waitFor(async () => {
    try { return await fs.readFile(path.join(sandbox.mainSource, ENGINE_TOOL_HARNESS_REL_PATH), "utf8") === ENGINE_TOOL_HARNESS_CONTENT; } catch { return false; }
  }, "packaged Agent write");
  const sessionPath = await page.locator('[data-chat-selection-root][data-session-path]:visible').getAttribute("data-session-path");
  if (!sessionPath || !path.resolve(sessionPath).startsWith(`${path.resolve(sandbox.hanaHome)}${path.sep}`)) {
    throw new Error("packaged Agent session escaped isolated Hana home");
  }
  return true;
}

async function runAtSearchFlow(serverInfo, sandbox, page) {
  const fileName = "windows-packaged-at-search.md";
  await fs.writeFile(path.join(sandbox.mainSource, fileName), "# @ search lifecycle\n", "utf8");
  await page.locator('[data-tab="chat"]').click();
  const input = page.locator("#inputBox");
  await input.waitFor({ state: "visible", timeout: 30_000 });
  await input.click();
  await page.keyboard.insertText(`@${fileName.replace(/\.md$/u, "")}`);
  const option = page.locator('[role="dialog"] [role="option"]').filter({ hasText: fileName });
  await option.waitFor({ state: "visible", timeout: 30_000 });
  await page.keyboard.press("Enter");
  await waitFor(async () => (await page.locator('[role="dialog"]').count()) === 0, "packaged @ selection close");
  return true;
}

async function terminateTree(pid) {
  if (!pid) return;
  const taskkill = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  await new Promise((resolve) => taskkill.once("exit", resolve));
  await sleep(500);
}

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function runPackagedDirectFlow({ installRoot, version = "0.446.6" }) {
  assertPackagedFlowPlatform();
  const sandbox = await createKnowledgeWorkspaceSandbox(924, { engineToolHarness: true });
  let child = null;
  let browser = null;
  let serverPid = null;
  let output = "";
  const receipt = {
    platform: process.platform,
    arch: process.arch,
    appLaunched: false,
    healthReady: false,
    workspace: false,
    office: false,
    agent: false,
    at: false,
    cleanup: { appStopped: false, serverStopped: false, sandboxDisposed: false },
  };
  try {
    const config = createKnowledgeLaunchConfig(sandbox);
    const roamingAppData = path.join(sandbox.userHome, "AppData", "Roaming");
    const localAppData = path.join(sandbox.userHome, "AppData", "Local");
    await fs.mkdir(roamingAppData, { recursive: true });
    await fs.mkdir(localAppData, { recursive: true });
    const packagedPiAiPath = resolvePackagedPiAiPath({ hanaHome: sandbox.hanaHome, version, arch: process.arch });
    const providerPath = path.join(sandbox.hanaHome, "plugins", ENGINE_TOOL_HARNESS_PROVIDER_ID, "providers", `${ENGINE_TOOL_HARNESS_PROVIDER_ID}.js`);
    const providerSource = await fs.readFile(providerPath, "utf8");
    const sourcePiAiUrl = import.meta.resolve("@earendil-works/pi-ai");
    await fs.writeFile(providerPath, providerSource.replace(sourcePiAiUrl, `file://${packagedPiAiPath.replaceAll("\\", "/")}`), "utf8");
    const chromiumPort = await reservePort();
    const env = { ...config.env };
    env.APPDATA = roamingAppData;
    env.LOCALAPPDATA = localAppData;
    delete env.HANA_ROOT;
    child = spawn(path.resolve(installRoot, "HanaKDE.exe"), [
      `--remote-debugging-port=${chromiumPort}`,
      "--remote-debugging-address=127.0.0.1",
      ...WINDOWS_CHROMIUM_SWITCHES,
      ...config.electronArgs,
    ], { cwd: path.resolve(installRoot), env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    child.stdout.on("data", (chunk) => { output = `${output}${chunk}`.slice(-20_000); });
    child.stderr.on("data", (chunk) => { output = `${output}${chunk}`.slice(-20_000); });
    const serverInfo = await waitForFile(path.join(sandbox.hanaHome, "server-info.json"), child, (value) => Number.isInteger(value?.pid) && Number.isInteger(value?.port) && typeof value?.token === "string");
    serverPid = serverInfo.pid;
    const health = await json(await apiFetch(serverInfo, "/api/health"), "packaged health");
    receipt.healthReady = health.status === "ok" || health.ok === true;
    browser = await waitForCdp(chromiumPort, child);
    const page = await waitForMainPage(browser, child);
    page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}));
    receipt.appLaunched = true;
    await page.locator('[data-tab="knowledge"]').click();
    await page.locator('[data-knowledge-workspace]').waitFor({ state: "visible", timeout: 30_000 });
    receipt.workspace = true;
    await runOfficeFlow(serverInfo, sandbox);
    receipt.office = true;
    await runAgentFlow(serverInfo, sandbox, page);
    receipt.agent = true;
    await runAtSearchFlow(serverInfo, sandbox, page);
    receipt.at = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n[windows-packaged-flow output]\n${output}`, { cause: error });
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (child && child.exitCode === null && child.signalCode === null) await terminateTree(child.pid);
    receipt.cleanup.appStopped = !child || !isPidAlive(child.pid);
    if (serverPid) await waitFor(() => {
      return !isPidAlive(serverPid);
    }, "packaged server exit", 15_000).catch(() => {});
    receipt.cleanup.serverStopped = !serverPid || !isPidAlive(serverPid);
    await sandbox.dispose();
    receipt.cleanup.sandboxDisposed = true;
  }
  return assertPackagedFlowReceipt(receipt);
}

async function waitForCdp(port, child) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("packaged app exited before CDP");
    try { return await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await sleep(100); }
  }
  throw new Error("timed out waiting for packaged Chromium CDP");
}

async function waitForMainPage(browser, child) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("packaged app exited before main window");
    for (const context of browser.contexts()) {
      const page = context.pages().find((candidate) => /(?:^|\/)index\.html(?:[?#]|$)/u.test(candidate.url()));
      if (page) { await page.waitForLoadState("domcontentloaded"); return page; }
    }
    await sleep(100);
  }
  throw new Error("packaged main window did not open");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPackagedDirectFlow(parsePackagedFlowOptions(process.argv.slice(2))).then((receipt) => {
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
