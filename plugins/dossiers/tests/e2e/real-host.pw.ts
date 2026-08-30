import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

const activatedWorkspaceRoot = process.env.HANA_DOSSIERS_E2E_WORKSPACE_ROOT ?? process.cwd();
let workspace = "";
let sourceFile = "";

test.beforeAll(() => {
  workspace = mkdtempSync(join(activatedWorkspaceRoot, ".hana-dossiers-e2e-"));
  sourceFile = join(workspace, "source-contract.txt");
  writeFileSync(sourceFile, "portable dossier e2e content", "utf8");
});

test.afterAll(() => {
  if (!workspace) return;
  const resolved = workspace.replaceAll("\\", "/");
  if (!resolved.includes("/.hana-dossiers-e2e-")) throw new Error("Refusing to remove an unexpected E2E workspace");
  rmSync(workspace, { recursive: true, force: true });
});

async function seedWorkspace(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript((workspacePath) => {
    localStorage.setItem("hana.dossiers.workspace.v1", JSON.stringify({ kind: "local-file", path: workspacePath, name: "Dossiers E2E" }));
  }, workspace);
}

async function dispatch<T>(page: import("@playwright/test").Page, operation: string, payload: Record<string, unknown> = {}): Promise<T> {
  return page.evaluate(async ({ operation: name, payload: input, workspacePath }) => {
    const token = new URL(location.href).searchParams.get("pluginSurfaceSession");
    if (!token) throw new Error("real Page is missing pluginSurfaceSession");
    const response = await fetch("/api/plugins/dossiers/ui/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hana-Plugin-Surface-Session": token },
      body: JSON.stringify({ operation: name, workspace: { kind: "local-file", path: workspacePath }, payload: input })
    });
    const value = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(value));
    return value;
  }, { operation, payload, workspacePath: workspace }) as Promise<T>;
}

test.describe("real Hana Dossiers Page", () => {
  test("creates, copies, toggles privacy, trashes, restores, exports, and survives reload", async ({ page }, testInfo) => {
    const base = process.env.HANA_DOSSIERS_E2E_URL!;
    const authFailures: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/plugins/dossiers/") && [401, 403].includes(response.status())) authFailures.push(`${response.status()} ${response.url()}`);
    });
    await seedWorkspace(page);
    await page.goto(base);
    await expect(page.getByRole("heading", { name: "档案" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "新建档案" })).toBeVisible();

    await page.getByRole("button", { name: "新建档案" }).click();
    const marker = `E2E 企业档案 ${Date.now()}`;
    await page.getByLabel("新档案类型").selectOption({ label: "组织" });
    await page.getByLabel("新档案名称").fill(marker);
    const createdResponse = page.waitForResponse(async (response) => {
      if (!response.url().endsWith("/api/plugins/dossiers/ui/dispatch") || response.request().method() !== "POST") return false;
      return (await response.request().postDataJSON()).operation === "catalog.create";
    });
    await page.getByRole("button", { name: "创建档案", exact: true }).click();
    expect((await createdResponse).status()).toBe(200);
    await expect(page.getByText(marker).first()).toBeVisible();

    const search = await dispatch<{ items: Array<{ dossierId: string; revision: number }> }>(page, "catalog.search", { query: marker, limit: 10 });
    expect(search.items).toHaveLength(1);
    const dossier = search.items[0]!;
    const preview = await dispatch<{ previewId: string; expectedRevision: number }>(page, "documents.preview", {
      dossierId: dossier.dossierId,
      expectedRevision: dossier.revision,
      categoryId: "general",
      sources: [{ ref: { kind: "local-file", path: sourceFile } }]
    });
    await dispatch(page, "documents.commit", { previewId: preview.previewId, expectedRevision: preview.expectedRevision });

    await page.getByRole("button", { name: "档案内容" }).click();
    await expect(page.getByText("source-contract.txt")).toBeVisible();
    const model = page.getByLabel("模型访问");
    await page.locator(".operations-model-toggle").click();
    await expect(model).not.toBeChecked();
    await expect(page.getByText("资料内容访问已关闭")).toBeVisible();

    await page.getByRole("button", { name: /将source-contract\.txt移至回收站/ }).click();
    await page.getByRole("button", { name: "移至回收站", exact: true }).click();
    await page.getByRole("button", { name: "维护" }).click();
    await expect(page.getByText("source-contract.txt")).toBeVisible();
    await page.getByRole("button", { name: "恢复", exact: true }).click();

    await page.getByRole("tab", { name: "导入导出" }).click();
    await page.getByRole("button", { name: "导出", exact: true }).click();
    await expect(page.getByText(/\.zip/)).toBeVisible();

    const exported = await dispatch<{ archiveRef: { kind: "local-file"; path: string } }>(page, "exchange.export", { dossierId: dossier.dossierId });
    const inspected = await dispatch<{ previewId: string; confirmationToken: string }>(page, "exchange.inspect", { archiveRef: exported.archiveRef });
    const imported = await dispatch<{ dossierId: string }>(page, "exchange.commit", { previewId: inspected.previewId, confirmationToken: inspected.confirmationToken });
    expect(imported.dossierId).not.toBe(dossier.dossierId);
    expect((await dispatch<{ state: string }>(page, "migration.status")).state).toBe("ready");

    await page.reload();
    await expect(page.getByText(marker).first()).toBeVisible();
    const screenshotDir = process.env.HANA_DOSSIERS_E2E_SCREENSHOT_DIR;
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, `T-11-${testInfo.project.name}-journey.png`), fullPage: true });
    expect(authFailures).toEqual([]);
  });

  test("is responsive and keyboard reachable at the host viewport", async ({ page }) => {
    await seedWorkspace(page);
    await page.goto(process.env.HANA_DOSSIERS_E2E_URL!);
    await expect(page.locator(".dossiers-toolbar")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus-visible")).toHaveCount(1);
  });
});
