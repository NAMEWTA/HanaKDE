/* global document, HTMLElement, getComputedStyle */
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const baseUrl = process.env.CATALOG_HARNESS_URL ?? "http://127.0.0.1:5187/harness.html";
const outputDir = path.resolve(process.argv[2] ?? "speculo/.speculo/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/assets");
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

async function inspectPage(page, label) {
  const metrics = await page.evaluate(() => {
    const root = document.querySelector(".catalog-feature");
    if (!(root instanceof HTMLElement)) throw new Error("CatalogFeature did not render");
    const toolbar = [...document.querySelectorAll(".catalog-toolbar > *")].filter((element) => element instanceof HTMLElement && getComputedStyle(element).display !== "none");
    const boxes = toolbar.map((element) => element.getBoundingClientRect());
    const overlaps = boxes.flatMap((left, index) => boxes.slice(index + 1).map((right) => ({
      width: Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)),
      height: Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top)),
    }))).filter((intersection) => intersection.width > 1 && intersection.height > 1);
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rootOverflow: root.scrollWidth - root.clientWidth,
      toolbarOverlaps: overlaps.length,
    };
  });
  if (metrics.documentOverflow > 1 || metrics.rootOverflow > 1 || metrics.toolbarOverlaps > 0) throw new Error(`${label} layout failed: ${JSON.stringify(metrics)}`);
  return metrics;
}

try {
  for (const scenario of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "narrow", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /广州数据交易所/ }).waitFor();
    const listMetrics = await inspectPage(page, `${scenario.name}-list`);
    await page.screenshot({ path: path.join(outputDir, `T-09-${scenario.name}-list.png`), fullPage: true });

    await page.getByRole("button", { name: /广州数据交易所/ }).click();
    await page.getByRole("heading", { name: "广州数据交易所" }).waitFor();
    const detailMetrics = await inspectPage(page, `${scenario.name}-detail`);
    await page.screenshot({ path: path.join(outputDir, `T-09-${scenario.name}-detail.png`), fullPage: true });

    await page.keyboard.press("Home");
    for (let index = 0; index < 8; index += 1) await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement) || element === document.body) return null;
      const box = element.getBoundingClientRect();
      return { tag: element.tagName, label: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 40) ?? "", visible: box.width > 0 && box.height > 0 };
    });
    if (!focus?.visible) throw new Error(`${scenario.name} keyboard focus is not visible`);
    if (errors.length) throw new Error(`${scenario.name} browser errors: ${errors.join(" | ")}`);
    results.push({ scenario: scenario.name, listMetrics, detailMetrics, focus });
    await page.close();
  }
  process.stdout.write(`${JSON.stringify({ ok: true, results }, null, 2)}\n`);
} finally {
  await browser.close();
}
