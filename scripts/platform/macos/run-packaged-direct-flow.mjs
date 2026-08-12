import { randomUUID } from "node:crypto";
import { execFile as execFileCallback, spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

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

const execFile = promisify(execFileCallback);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const ARCH_PATTERN = /^(?:arm64|x64)$/;
const childErrors = new WeakMap();

export function assertPackagedFlowPlatform(platform = process.platform) {
  if (platform !== "darwin") {
    throw new Error(`[macos-packaged-flow] requires darwin, got ${platform}`);
  }
}

function optionValue(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`[macos-packaged-flow] ${name} requires a value`);
  }
  return value;
}

export function parsePackagedFlowOptions(argv) {
  const dmgInput = optionValue(argv, "--dmg");
  if (!dmgInput) throw new Error("[macos-packaged-flow] --dmg is required");
  const dmgPath = path.resolve(dmgInput);
  if (!fsSync.statSync(dmgPath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error("[macos-packaged-flow] --dmg must name an existing file");
  }
  const version = optionValue(argv, "--version") ?? "0.446.6";
  if (!VERSION_PATTERN.test(version)) {
    throw new Error("[macos-packaged-flow] version must be a semantic artifact version");
  }
  return {
    dmgPath,
    version,
    adhocResign: argv.includes("--adhoc-resign"),
  };
}

export function resolvePackagedPiAiPath({
  hanaHome,
  version,
  platform,
  arch,
}) {
  const resolvedHome = path.resolve(hanaHome);
  if (!VERSION_PATTERN.test(version)) {
    throw new Error("[macos-packaged-flow] invalid package artifact version");
  }
  if (platform !== "darwin" || !ARCH_PATTERN.test(arch)) {
    throw new Error("[macos-packaged-flow] invalid package artifact platform or architecture");
  }
  const resolved = path.join(
    resolvedHome,
    "artifacts",
    "server",
    `${version}-${platform}-${arch}`,
    "node_modules",
    "@earendil-works",
    "pi-ai",
    "dist",
    "index.js",
  );
  if (!resolved.startsWith(`${resolvedHome}${path.sep}`)) {
    throw new Error("[macos-packaged-flow] package provider escaped HANA_HOME");
  }
  return resolved;
}

export function assertPackagedFlowReceipt(receipt) {
  const required = [
    ["dmgVerified", receipt?.dmgVerified],
    ["dmgMounted", receipt?.dmgMounted],
    ["appInstalled", receipt?.appInstalled],
    ["appLaunched", receipt?.appLaunched],
    ["unsafeNoSandboxAbsent", receipt?.unsafeNoSandboxAbsent],
    ["healthReady", receipt?.healthReady],
    ["history.live", receipt?.history?.live],
    ["history.afterReload", receipt?.history?.afterReload],
    ["office", receipt?.office],
    ["agent", receipt?.agent],
    ["at", receipt?.at],
    ["cleanup.appStopped", receipt?.cleanup?.appStopped],
    ["cleanup.serverStopped", receipt?.cleanup?.serverStopped],
    ["cleanup.mountDetached", receipt?.cleanup?.mountDetached],
    ["cleanup.sandboxDisposed", receipt?.cleanup?.sandboxDisposed],
  ];
  const failed = required.find(([, value]) => value !== true);
  if (failed) throw new Error(`[macos-packaged-flow] incomplete receipt: ${failed[0]}`);
  if (receipt?.launchSigningMode !== "adhoc" && receipt?.launchSigningMode !== "package") {
    throw new Error("[macos-packaged-flow] incomplete receipt: launchSigningMode");
  }
  return receipt;
}

async function verifyDmg(dmgPath) {
  await execFile("hdiutil", ["verify", dmgPath], { maxBuffer: 4 * 1024 * 1024 });
}

async function mountDmg(dmgPath, mountPoint) {
  await fs.mkdir(mountPoint, { recursive: true });
  await execFile("hdiutil", [
    "attach",
    dmgPath,
    "-readonly",
    "-nobrowse",
    "-mountpoint",
    mountPoint,
  ], { maxBuffer: 4 * 1024 * 1024 });
}

async function detachDmg(mountPoint) {
  await execFile("hdiutil", ["detach", mountPoint], { maxBuffer: 4 * 1024 * 1024 });
}

async function copyMountedApp(mountPoint, installRoot) {
  const entries = await fs.readdir(mountPoint, { withFileTypes: true });
  const apps = entries.filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
  if (apps.length !== 1) {
    throw new Error(`[macos-packaged-flow] expected one mounted app, found ${apps.length}`);
  }
  const installedApp = path.join(installRoot, apps[0].name);
  await fs.mkdir(installRoot, { recursive: true });
  await fs.cp(path.join(mountPoint, apps[0].name), installedApp, {
    recursive: true,
    verbatimSymlinks: true,
  });
  return installedApp;
}

async function adhocResignApp(appPath) {
  const entitlements = path.resolve("desktop/entitlements.mac.plist");
  const computerUseHelper = path.join(
    appPath,
    "Contents",
    "Resources",
    "computer-use",
    "macos",
    "hana-computer-use-helper",
  );
  if (fsSync.existsSync(computerUseHelper)) {
    await execFile("codesign", ["--sign", "-", "--force", computerUseHelper]);
  }
  const frameworks = path.join(appPath, "Contents", "Frameworks");
  for (const entry of await fs.readdir(frameworks)) {
    const target = path.join(frameworks, entry);
    if (entry.endsWith(".framework")) {
      await execFile("codesign", ["--sign", "-", "--force", "--deep", target]);
    } else if (entry.endsWith(".app")) {
      await execFile("codesign", [
        "--sign",
        "-",
        "--force",
        "--entitlements",
        entitlements,
        target,
      ]);
    }
  }
  await execFile("codesign", [
    "--sign",
    "-",
    "--force",
    "--entitlements",
    entitlements,
    appPath,
  ]);
  await execFile("codesign", ["--verify", "--deep", "--strict", appPath]);
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
  if (!port) throw new Error("could not reserve CDP port");
  return port;
}

async function waitForJson(file, child, timeoutMs = 90_000, predicate = () => true) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const spawnError = childErrors.get(child);
    if (spawnError) {
      throw new Error(`packaged app failed to spawn: ${spawnError.message}`);
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`packaged app exited before ${path.basename(file)} (${child.exitCode ?? child.signalCode})`);
    }
    try {
      const parsed = JSON.parse(await fs.readFile(file, "utf8"));
      if (predicate(parsed)) return parsed;
    } catch {
      // Atomic writers may leave the marker absent or incomplete between polls.
    }
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${file}`);
}

async function connectCdp(port, child) {
  const deadline = Date.now() + 90_000;
  let lastError = null;
  while (Date.now() < deadline) {
    const spawnError = childErrors.get(child);
    if (spawnError) {
      throw new Error(`packaged app failed to spawn: ${spawnError.message}`);
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`packaged app exited before CDP (${child.exitCode ?? child.signalCode})`);
    }
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }
  throw new Error(`timed out waiting for packaged CDP: ${lastError?.message || lastError}`);
}

async function waitForMainPage(browser, child) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const spawnError = childErrors.get(child);
    if (spawnError) {
      throw new Error(`packaged app failed to spawn: ${spawnError.message}`);
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`packaged app exited before the main window (${child.exitCode ?? child.signalCode})`);
    }
    for (const context of browser.contexts()) {
      const page = context.pages().find((candidate) => /(?:^|\/)index\.html(?:[?#]|$)/.test(candidate.url()));
      if (page) {
        await page.waitForLoadState("domcontentloaded");
        return page;
      }
    }
    await sleep(100);
  }
  throw new Error("packaged main window did not open");
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

async function waitFor(predicate, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}: ${JSON.stringify(last)}`);
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
    return status?.health?.state === "ready" ? status : null;
  }, "initial main index");

  const original = await fs.readFile(path.resolve("tests/fixtures/document-extract/sample.docx"));
  const revised = await replaceDocxText(original, "Quarterly Notes", "Revised Forecast");
  await fs.writeFile(path.join(sandbox.mainSource, "Quarterly.docx"), original);
  const rebuilt = await json(await apiFetch(serverInfo, "/api/knowledge-workspace/index/main/rebuild", {
    method: "POST",
  }), "main rebuild");
  if (rebuilt?.health?.state !== "ready") throw new Error("main rebuild did not return ready");
  await waitFor(async () => JSON.stringify(await search(serverInfo, "Quarterly Notes")).includes("Quarterly.docx"), "initial Office search");

  const initial = await json(await apiFetch(serverInfo, "/api/resource-io/stat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: { sourceKey: "main", relativePath: "Quarterly.docx" } }),
  }), "Office stat");
  await writeExpected(serverInfo, "Quarterly.docx", revised.toString("base64"), "base64", initial.version, "packaged_office_edit");
  await waitFor(async () => JSON.stringify(await search(serverInfo, "Revised Forecast")).includes("Quarterly.docx"), "revised Office search");

  const current = await json(await apiFetch(serverInfo, "/api/resource-io/stat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: { sourceKey: "main", relativePath: "Quarterly.docx" } }),
  }), "revised Office stat");
  await writeExpected(serverInfo, "Quarterly.docx", original.toString("base64"), "base64", current.version, "history_restore");
  await waitFor(async () => JSON.stringify(await search(serverInfo, "Quarterly Notes")).includes("Quarterly.docx"), "restored Office search");
  const staleSearch = JSON.stringify(await search(serverInfo, "Revised Forecast"));
  if (staleSearch.includes("Quarterly.docx")) throw new Error("restored Office search retained stale text");
  if ((await fs.readdir(sandbox.mainSource)).includes("Quarterly.md")) throw new Error("Office flow created a derived Markdown file");
}

async function historyEntry(serverInfo, relativePath) {
  const body = await json(await apiFetch(serverInfo, "/api/file-history/files"), "History files");
  return Array.isArray(body.files) ? body.files.find((entry) => entry?.relPath === relativePath) : null;
}

async function readMain(serverInfo, relativePath) {
  const body = await json(await apiFetch(serverInfo, "/api/resource-io/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: { sourceKey: "main", relativePath },
      encoding: "utf-8",
    }),
  }), `read ${relativePath}`);
  return body.content;
}

async function runHistoryFlow(serverInfo, page) {
  await page.locator('[data-tab="chat"]').click();
  const entryButton = page.getByTestId("file-history-entry");
  await entryButton.waitFor({ state: "visible", timeout: 30_000 });

  const relativePath = "Packaged History E2E.md";
  const initialContent = "# Packaged History E2E\n\nInitial body.\n";
  const revisedContent = "# Packaged History E2E\n\nRevised body.\n";
  const first = await writeExpected(serverInfo, relativePath, initialContent, "utf-8", null, "packaged_history_e2e");
  const firstSnapshot = await waitFor(async () => {
    const entry = await historyEntry(serverInfo, relativePath);
    return entry?.snapshotCount >= 1 ? entry : null;
  }, "first History snapshot");
  const mergeWindowDeadline = firstSnapshot.lastCapturedAt + 60_050;
  if (Date.now() < mergeWindowDeadline) await sleep(mergeWindowDeadline - Date.now());
  await writeExpected(serverInfo, relativePath, revisedContent, "utf-8", first.version, "packaged_history_e2e");
  await waitFor(async () => {
    const entry = await historyEntry(serverInfo, relativePath);
    return entry?.snapshotCount >= 2 ? entry : null;
  }, "second History snapshot");

  await entryButton.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 30_000 });
  if (await dialog.getAttribute("data-history-source") !== "main") throw new Error("packaged History dialog did not retain main authority");
  await dialog.getByRole("button", { name: relativePath, exact: true }).click();
  const versions = dialog.locator('[data-testid^="fh-version-"]');
  if (await versions.count() !== 2) throw new Error(`expected 2 packaged History versions, got ${await versions.count()}`);
  await versions.last().click();
  await waitFor(async () => {
    const diffText = await dialog.locator("pre[aria-label]").textContent();
    return diffText?.includes("Initial body.") && diffText.includes("Revised body.")
      ? diffText
      : null;
  }, "packaged History diff");
  const responsePromise = page.waitForResponse((response) => (
    response.url().includes("/api/resource-io/write-expected-version")
    && response.request().method() === "POST"
  ));
  await dialog.getByTestId("fh-restore").click();
  const response = await responsePromise;
  if (!response.ok()) throw new Error(`packaged History restore returned ${response.status()}`);
  await waitFor(async () => await readMain(serverInfo, relativePath) === initialContent, "packaged History restore read-back");
  if (await dialog.getByRole("status").getAttribute("data-health") !== "HEALTHY") {
    throw new Error("packaged History dialog did not converge to HEALTHY");
  }
  await dialog.getByRole("button", { name: "Close" }).click();
  await dialog.waitFor({ state: "hidden" });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-tab="chat"]').click();
  const reloadedEntry = page.getByTestId("file-history-entry");
  await reloadedEntry.waitFor({ state: "visible", timeout: 30_000 });
  await reloadedEntry.click();
  const reloadedDialog = page.getByRole("dialog");
  await reloadedDialog.waitFor({ state: "visible", timeout: 30_000 });
  await reloadedDialog.getByRole("button", { name: relativePath, exact: true }).click();
  const persistedVersions = reloadedDialog.locator('[data-testid^="fh-version-"]');
  if (await persistedVersions.count() !== 2) {
    throw new Error(`expected 2 persisted History versions, got ${await persistedVersions.count()}`);
  }
  if (await readMain(serverInfo, relativePath) !== initialContent) {
    throw new Error("packaged History restore did not survive renderer reload");
  }
  await reloadedDialog.getByRole("button", { name: "Close" }).click();
  await reloadedDialog.waitFor({ state: "hidden" });
  return { live: true, afterReload: true };
}

async function runAgentHistoryFlow(serverInfo, sandbox, page) {
  await json(await apiFetch(serverInfo, "/api/models/set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelId: ENGINE_TOOL_HARNESS_MODEL_ID,
      provider: ENGINE_TOOL_HARNESS_PROVIDER_ID,
    }),
  }), "Engine tool harness model selection");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-tab="chat"]').click();
  const editor = page.locator('.ProseMirror[contenteditable="true"]:visible').last();
  await editor.waitFor({ state: "visible", timeout: 30_000 });
  await editor.fill("Create the deterministic Agent History fixture.");
  await editor.press("Enter");
  await page.getByText(ENGINE_TOOL_HARNESS_COMPLETE, { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await waitFor(async () => {
    try {
      return await fs.readFile(path.join(sandbox.mainSource, ENGINE_TOOL_HARNESS_REL_PATH), "utf8")
        === ENGINE_TOOL_HARNESS_CONTENT;
    } catch {
      return false;
    }
  }, "packaged Agent write");

  const sessionPath = await page.locator('[data-chat-selection-root][data-session-path]:visible')
    .getAttribute("data-session-path");
  if (!sessionPath) throw new Error("packaged Agent session path was not exposed");
  const resolvedSessionPath = path.resolve(sessionPath);
  if (!resolvedSessionPath.startsWith(`${path.resolve(sandbox.hanaHome)}${path.sep}`)) {
    throw new Error("packaged Agent session escaped the isolated Hana home");
  }
  const persisted = (await fs.readFile(resolvedSessionPath, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const hasPersistedReceipt = persisted.some((entry) => (
    entry?.message?.role === "toolResult"
    && entry?.message?.toolName === "write"
    && entry?.message?.details?.agentFileChange?.resource?.sourceKey === "main"
    && entry?.message?.details?.agentFileChange?.resource?.relativePath === ENGINE_TOOL_HARNESS_REL_PATH
  ));
  if (!hasPersistedReceipt) throw new Error("packaged Agent session omitted its authoritative History receipt");

  const replay = await json(await apiFetch(
    serverInfo,
    `/api/sessions/messages?path=${encodeURIComponent(resolvedSessionPath)}`,
  ), "packaged Agent replay");
  const hasReplayReceipt = Array.isArray(replay.blocks) && replay.blocks.some((block) => (
    block?.agentFileChange?.resource?.sourceKey === "main"
    && block?.agentFileChange?.resource?.relativePath === ENGINE_TOOL_HARNESS_REL_PATH
  ));
  if (!hasReplayReceipt) throw new Error("packaged Agent replay omitted its authoritative History receipt");

  await page.reload({ waitUntil: "domcontentloaded" });
  const sessionRow = page.locator(`button[data-session-path=${JSON.stringify(resolvedSessionPath)}]`);
  await sessionRow.waitFor({ state: "visible", timeout: 30_000 });
  await sessionRow.click();
  await page.getByText(ENGINE_TOOL_HARNESS_COMPLETE, { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  const impact = page.getByTestId("agent-file-change-history");
  await impact.waitFor({ state: "visible", timeout: 30_000 });
  if (await impact.getAttribute("data-agent-file-impact") !== "main") {
    throw new Error("packaged Agent mutation was not projected as main impact");
  }
  const historyEntry = impact.getByTestId("file-history-entry");
  if (await historyEntry.getAttribute("data-history-source") !== "main") {
    throw new Error("packaged Agent History entry lost main authority");
  }
  await historyEntry.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 30_000 });
  if (await dialog.getAttribute("data-history-source") !== "main") {
    throw new Error("packaged Agent History dialog lost main authority");
  }
  await dialog.getByTestId("fh-restore").waitFor({ state: "visible", timeout: 30_000 });
  return true;
}

async function runAtSearchFlow(serverInfo, sandbox, page) {
  const fileName = "at-search-lifecycle-token.md";
  await fs.writeFile(
    path.join(sandbox.mainSource, fileName),
    "# @ search lifecycle\n",
    "utf8",
  );
  await page.locator('[data-tab="chat"]').click();
  const input = page.locator("#inputBox");
  await input.waitFor({ state: "visible", timeout: 30_000 });
  await input.click();
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (url.pathname === "/api/desk/search-files" || url.pathname === "/api/workbench/search")
      && url.searchParams.get("q") === "at-search-lifecycle-token";
  });
  await page.keyboard.insertText("@at-search-lifecycle-token");
  const response = await responsePromise;
  const payload = await json(response, "packaged @ search");
  if (!Array.isArray(payload.results) || !payload.results.some((entry) => entry?.name === fileName)) {
    throw new Error("packaged @ search omitted the active workspace file");
  }
  const option = page.locator('[role="dialog"] [role="option"]').filter({ hasText: fileName });
  await option.waitFor({ state: "visible", timeout: 30_000 });
  await page.keyboard.press("Enter");
  await waitFor(async () => await page.locator('[role="dialog"]').count() === 0, "packaged @ selection close");
  if (!(await input.textContent())?.includes(fileName)) {
    throw new Error("packaged @ selection did not insert the workspace resource");
  }
  await page.keyboard.insertText("@at-search-lifecycle-token");
  await option.waitFor({ state: "visible", timeout: 30_000 });
  await page.keyboard.press("Escape");
  await waitFor(async () => await page.locator('[role="dialog"]').count() === 0, "packaged @ escape close");
  const health = await json(await apiFetch(serverInfo, "/api/health"), "post-@ health");
  if (!(health.status === "ok" || health.ok === true)) {
    throw new Error("packaged runtime was not healthy after @ search");
  }
  return true;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopOwnedProcess(child, serverPid) {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      sleep(15_000),
    ]);
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      sleep(5_000),
    ]);
  }
  const appStopped = child.exitCode !== null || child.signalCode !== null;
  if (serverPid && pidAlive(serverPid)) {
    try { process.kill(serverPid, "SIGTERM"); } catch {
      // The server may have exited between the liveness check and signal.
    }
    await sleep(1_000);
    if (pidAlive(serverPid)) {
      try { process.kill(serverPid, "SIGKILL"); } catch {
        // The server may have exited after the graceful-shutdown deadline.
      }
    }
    await waitFor(async () => !pidAlive(serverPid), "packaged server exit", 10_000);
  }
  return { appStopped, serverStopped: !serverPid || !pidAlive(serverPid) };
}

function redactedFailure(error, output, sandboxRoot) {
  const message = error instanceof Error ? error.message : String(error);
  const diagnostic = output.replaceAll(sandboxRoot, "<sandbox>").slice(-8_000);
  return new Error(
    diagnostic ? `${message}\n[packaged output]\n${diagnostic}` : message,
    { cause: error },
  );
}

export async function runPackagedDirectFlow({
  dmgPath,
  version,
  adhocResign = false,
}) {
  assertPackagedFlowPlatform();
  if (!VERSION_PATTERN.test(version)) {
    throw new Error("[macos-packaged-flow] invalid package artifact version");
  }
  const resolvedDmg = path.resolve(dmgPath);
  if (!fsSync.statSync(resolvedDmg, { throwIfNoEntry: false })?.isFile()) {
    throw new Error("[macos-packaged-flow] DMG does not exist");
  }

  const sandbox = await createKnowledgeWorkspaceSandbox(923, { engineToolHarness: true });
  const mountPoint = path.join(sandbox.rootDir, "mounted-dmg");
  const installRoot = path.join(sandbox.rootDir, "Applications");
  const receipt = {
    platform: process.platform,
    arch: process.arch,
    dmgVerified: false,
    dmgMounted: false,
    appInstalled: false,
    launchSigningMode: adhocResign ? "adhoc" : "package",
    appLaunched: false,
    unsafeNoSandboxAbsent: false,
    healthReady: false,
    history: { live: false, afterReload: false },
    office: false,
    agent: false,
    at: false,
    cleanup: {
      appStopped: false,
      serverStopped: false,
      mountDetached: false,
      sandboxDisposed: false,
    },
  };
  const cleanupErrors = [];
  let primaryError = null;
  let mounted = false;
  let child = null;
  let browser = null;
  let serverPid = null;
  let output = "";

  try {
    await verifyDmg(resolvedDmg);
    receipt.dmgVerified = true;
    mounted = true;
    await mountDmg(resolvedDmg, mountPoint);
    receipt.dmgMounted = true;
    const installedApp = await copyMountedApp(mountPoint, installRoot);
    receipt.appInstalled = true;
    await detachDmg(mountPoint);
    mounted = false;
    receipt.cleanup.mountDetached = true;
    if (adhocResign) await adhocResignApp(installedApp);
    const appExecutable = path.join(installedApp, "Contents", "MacOS", "HanaAgent");
    if (!fsSync.statSync(appExecutable, { throwIfNoEntry: false })?.isFile()) {
      throw new Error("[macos-packaged-flow] installed app executable is missing");
    }

    const isolatedHanaHome = path.join(sandbox.rootDir, `hana-home-${randomUUID()}`);
    await fs.rename(sandbox.hanaHome, isolatedHanaHome);
    sandbox.hanaHome = isolatedHanaHome;
    const providerPath = path.join(
      sandbox.hanaHome,
      "plugins",
      ENGINE_TOOL_HARNESS_PROVIDER_ID,
      "providers",
      `${ENGINE_TOOL_HARNESS_PROVIDER_ID}.js`,
    );
    const sourcePiAiUrl = import.meta.resolve("@earendil-works/pi-ai");
    const packagedPiAiUrl = pathToFileURL(resolvePackagedPiAiPath({
      hanaHome: sandbox.hanaHome,
      version,
      platform: process.platform,
      arch: process.arch,
    })).href;
    const providerSource = await fs.readFile(providerPath, "utf8");
    if (!providerSource.includes(sourcePiAiUrl)) {
      throw new Error("Engine tool harness provider did not contain the expected source module URL");
    }
    await fs.writeFile(
      providerPath,
      providerSource.replace(sourcePiAiUrl, packagedPiAiUrl),
      "utf8",
    );

    const config = createKnowledgeLaunchConfig(sandbox);
    const cdpPort = await reservePort();
    const env = { ...config.env };
    delete env.HANA_ROOT;
    delete env.HANA_KNOWLEDGE_E2E;
    child = spawn(appExecutable, [
      ...config.electronArgs,
      `--remote-debugging-port=${cdpPort}`,
    ], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.once("error", (error) => {
      childErrors.set(child, error);
    });
    child.stdout.on("data", (chunk) => { output = `${output}${chunk}`.slice(-200_000); });
    child.stderr.on("data", (chunk) => { output = `${output}${chunk}`.slice(-200_000); });

    const marker = await waitForJson(
      path.join(sandbox.hanaHome, "diagnostics", "desktop-launch", "launch-marker.json"),
      child,
      90_000,
      (value) => value?.payload?.status === "main-loaded",
    );
    receipt.appLaunched = marker?.payload?.status === "main-loaded";
    receipt.unsafeNoSandboxAbsent = !(marker?.payload?.argv || []).includes("--no-sandbox");
    if (!receipt.unsafeNoSandboxAbsent) {
      throw new Error("packaged launch unexpectedly used --no-sandbox");
    }
    const serverInfo = await waitForJson(path.join(sandbox.hanaHome, "server-info.json"), child);
    serverPid = serverInfo.pid;
    const health = await json(await apiFetch(serverInfo, "/api/health"), "packaged health");
    receipt.healthReady = health.status === "ok" || health.ok === true;
    if (!receipt.healthReady) throw new Error("packaged runtime health was not ready");
    browser = await connectCdp(cdpPort, child);
    const page = await waitForMainPage(browser, child);
    await runOfficeFlow(serverInfo, sandbox);
    receipt.office = true;
    receipt.history = await runHistoryFlow(serverInfo, page);
    receipt.at = await runAtSearchFlow(serverInfo, sandbox, page);
    receipt.agent = await runAgentHistoryFlow(serverInfo, sandbox, page);
  } catch (error) {
    primaryError = redactedFailure(error, output, sandbox.rootDir);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (child) {
      try {
        const stopped = await stopOwnedProcess(child, serverPid);
        receipt.cleanup.appStopped = stopped.appStopped;
        receipt.cleanup.serverStopped = stopped.serverStopped;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (mounted) {
      try {
        await detachDmg(mountPoint);
        receipt.cleanup.mountDetached = true;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await sandbox.dispose();
      receipt.cleanup.sandboxDisposed = true;
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (primaryError || cleanupErrors.length > 0) {
    throw new AggregateError(
      primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors,
      "[macos-packaged-flow] packaged direct flow failed",
    );
  }
  return assertPackagedFlowReceipt(receipt);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parsePackagedFlowOptions(process.argv.slice(2));
  runPackagedDirectFlow(options).then((receipt) => {
    process.stdout.write(`T23_PACKAGED_FLOW_RESULT=${JSON.stringify(receipt)}\n`);
  }).catch((error) => {
    const details = error instanceof AggregateError
      ? error.errors.map((entry) => entry instanceof Error ? entry.stack : String(entry)).join("\n")
      : error instanceof Error ? error.stack : String(error);
    process.stderr.write(`${details}\n`);
    process.exitCode = 1;
  });
}
