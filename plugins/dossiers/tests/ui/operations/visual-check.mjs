/* global document, HTMLElement, getComputedStyle */
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const baseUrl = process.env.OPERATIONS_HARNESS_URL ?? "http://127.0.0.1:5188/harness.html";
const outputDir = path.resolve(process.argv[2] ?? "speculo/.speculo/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/assets");
await mkdir(outputDir, { recursive: true });

function url(view) { return `${baseUrl}?view=${view}`; }

async function metrics(page, label) {
  const value = await page.evaluate(() => {
    const root = document.querySelector(".operations-feature");
    if (!(root instanceof HTMLElement)) throw new Error("Operations feature did not render");
    const modal = document.querySelector(".operations-modal");
    const modalBox = modal instanceof HTMLElement ? modal.getBoundingClientRect() : null;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const bodyText = document.body.textContent ?? "";
    const visibleButtons = [...document.querySelectorAll("button")].filter((item) => item instanceof HTMLElement && getComputedStyle(item).display !== "none");
    return {
      documentOverflow: document.documentElement.scrollWidth - viewportWidth,
      rootOverflow: root.scrollWidth - root.clientWidth,
      modalOutside: modalBox ? Math.max(0, -modalBox.left, modalBox.right - viewportWidth, -modalBox.top, modalBox.bottom - viewportHeight) : 0,
      zeroButtons: visibleButtons.filter((item) => item.getBoundingClientRect().width < 20 || item.getBoundingClientRect().height < 20).length,
      sensitiveText: /[A-Za-z]:\\|\/Users\/|secret-body|ordinary managed content|@example/.test(bodyText),
    };
  });
  if (value.documentOverflow > 1 || value.rootOverflow > 1 || value.modalOutside > 1 || value.zeroButtons > 0 || value.sensitiveText) throw new Error(`${label} layout/privacy failed: ${JSON.stringify(value)}`);
  return value;
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const scenario of [{ name: "desktop", width: 1440, height: 900 }, { name: "narrow", width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(url("dossier"), { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "档案操作" }).waitFor();
    const dossier = await metrics(page, `${scenario.name}-dossier`);
    await page.screenshot({ path: path.join(outputDir, `T-10-${scenario.name}-dossier.png`), fullPage: true });
    await page.getByRole("button", { name: /加入资料/ }).click();
    await page.getByRole("dialog").waitFor();
    const documentConfirm = await metrics(page, `${scenario.name}-document-confirm`);
    await page.screenshot({ path: path.join(outputDir, `T-10-${scenario.name}-document-confirm.png`), fullPage: true });
    await page.keyboard.press("Escape");
    if (await page.getByRole("dialog").count()) throw new Error(`${scenario.name} Escape did not close confirmation`);

    await page.goto(url("maintenance"), { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "迁移恢复" }).click();
    await page.getByRole("button", { name: "预检迁移" }).click();
    await page.getByRole("dialog").waitFor();
    const migrationConfirm = await metrics(page, `${scenario.name}-migration-confirm`);
    await page.screenshot({ path: path.join(outputDir, `T-10-${scenario.name}-migration-confirm.png`), fullPage: true });
    for (let index = 0; index < 5; index += 1) await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return null;
      const box = active.getBoundingClientRect();
      return { tag: active.tagName, label: active.textContent?.trim().slice(0, 40) ?? "", insideDialog: Boolean(active.closest(".operations-modal")), visible: box.width > 0 && box.height > 0 };
    });
    if (!focus?.visible || !focus.insideDialog) throw new Error(`${scenario.name} confirmation focus escaped: ${JSON.stringify(focus)}`);
    if (errors.length) throw new Error(`${scenario.name} browser errors: ${errors.join(" | ")}`);
    results.push({ scenario: scenario.name, dossier, documentConfirm, migrationConfirm, focus });
    await page.close();
  }
  process.stdout.write(`${JSON.stringify({ ok: true, results }, null, 2)}\n`);
} finally { await browser.close(); }
