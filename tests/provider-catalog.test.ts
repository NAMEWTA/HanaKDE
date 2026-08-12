import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { ProviderCatalogStore } from "../core/provider-catalog.ts";
import { SEARCH_CAPABILITY_PROVIDERS } from "../shared/search-providers.ts";

let tmpDir: string;

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

describe("ProviderCatalogStore", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-provider-catalog-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns an empty normalized catalog without implicitly creating it", () => {
    const store = new ProviderCatalogStore(tmpDir);
    const catalog = store.load();

    expect(catalog.catalogVersion).toBe(2);
    expect(catalog.providers).toEqual({});
    expect(catalog.capabilities["web.search"]).toEqual({ providers: SEARCH_CAPABILITY_PROVIDERS });
    expect(fs.existsSync(store.catalogPath)).toBe(false);
  });

  it("ignores a legacy added-models file without importing or rewriting it", () => {
    const legacyPath = path.join(tmpDir, "added-models.yaml");
    const legacy = "providers:\n  openai:\n    api_key: sk-legacy\n";
    fs.writeFileSync(legacyPath, legacy, "utf-8");

    const store = new ProviderCatalogStore(tmpDir);
    const catalog = store.load();

    expect(catalog.providers).toEqual({});
    expect(fs.existsSync(store.catalogPath)).toBe(false);
    expect(fs.readFileSync(legacyPath, "utf-8")).toBe(legacy);
  });

  it.skipIf(process.platform === "win32")("keeps a saved catalog readable only by its owner", () => {
    const store = new ProviderCatalogStore(tmpDir);
    store.saveProviders({ zhipu: { api_key: "sk-rotated", api: "openai-completions", models: ["glm-4"] } });

    const catalogPath = path.join(tmpDir, "provider-catalog.json");
    expect(fs.statSync(catalogPath).mode & 0o777).toBe(0o600);
  });

  it("writes provider-catalog.json as the only catalog target", () => {
    const store = new ProviderCatalogStore(tmpDir);
    store.saveProviders({
      openai: {
        api_key: "sk-new",
        base_url: "https://api.openai.com/v1",
        api: "openai-completions",
        models: [{ id: "gpt-4o", image: true }],
      },
    });

    expect(readJson(store.catalogPath).providers.openai).toMatchObject({
      api_key: "sk-new",
      models: [{ id: "gpt-4o", image: true }],
    });
  });

  it("preserves structurally safe unknown capabilities for future adapters", () => {
    const store = new ProviderCatalogStore(tmpDir);
    store.save({
      catalogVersion: 2,
      providers: {
        custom: {
          base_url: "https://example.test/v1",
          api: "openai-completions",
          models: ["custom-chat"],
        },
      },
      capabilities: {
        "web.search": { providers: [{ id: "brave", source: "api" }] },
        "future.action": { providers: [{ id: "future", mode: "adapter" }] },
      },
    });

    const catalog = store.load();

    expect(catalog.capabilities["web.search"].providers).toEqual([{ id: "brave", source: "api" }]);
    expect(catalog.capabilities["future.action"].providers).toEqual([{ id: "future", mode: "adapter" }]);
  });

  it("loads provider-catalog.json files that start with a UTF-8 BOM", () => {
    const store = new ProviderCatalogStore(tmpDir);
    fs.writeFileSync(
      store.catalogPath,
      "\uFEFF" + JSON.stringify({
        catalogVersion: 2,
        providers: {
          deepseek: {
            api_key: "sk-bom",
            base_url: "https://api.deepseek.com",
            api: "openai-completions",
            models: ["deepseek-v4-pro"],
          },
        },
      }, null, 2) + "\n",
      "utf-8",
    );

    const catalog = store.load();

    expect(catalog.providers.deepseek).toMatchObject({
      api_key: "sk-bom",
      models: ["deepseek-v4-pro"],
    });
  });
});
