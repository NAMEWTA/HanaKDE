import fs from "fs";
import path from "path";

import { writeSecretFileSync } from "../shared/secret-fs.ts";
import { SEARCH_CAPABILITY_KIND, SEARCH_CAPABILITY_PROVIDERS } from "../shared/search-providers.ts";

export const PROVIDER_CATALOG_VERSION = 2;
export const PROVIDER_CATALOG_FILE = "provider-catalog.json";

const DEFAULT_CAPABILITIES = Object.freeze({
  [SEARCH_CAPABILITY_KIND]: Object.freeze({ providers: SEARCH_CAPABILITY_PROVIDERS }),
});

function isPlainObject(value: any): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}

function readJsonTextWithoutBom(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
}

function normalizeDeletedProviders(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((id) => typeof id === "string" && id.trim())
      .map((id) => id.trim()),
  )];
}

function normalizeProviderMap(value: any): Record<string, any> {
  if (!isPlainObject(value)) return {};
  const providers: Record<string, any> = {};
  for (const [providerId, config] of Object.entries(value)) {
    const id = typeof providerId === "string" ? providerId.trim() : "";
    if (!id) continue;
    providers[id] = isPlainObject(config) ? cloneData(config) : { _config_error: "malformed_provider_config" };
  }
  return providers;
}

function normalizeCapabilities(value: any): Record<string, any> {
  const raw = isPlainObject(value) ? value : {};
  const capabilities: Record<string, any> = {};
  for (const [capability, config] of Object.entries(DEFAULT_CAPABILITIES)) {
    capabilities[capability] = cloneData(config);
  }
  for (const [capability, config] of Object.entries(raw)) {
    if (typeof capability !== "string" || !capability.trim()) continue;
    if (!isPlainObject(config)) continue;
    capabilities[capability.trim()] = cloneData(config);
  }
  return capabilities;
}

export function normalizeProviderCatalog(value: any = {}) {
  const meta = isPlainObject(value.meta) ? cloneData(value.meta) : {};
  const deletedProviders = normalizeDeletedProviders(meta.deletedProviders);
  return {
    catalogVersion: PROVIDER_CATALOG_VERSION,
    providers: normalizeProviderMap(value.providers),
    capabilities: normalizeCapabilities(value.capabilities),
    meta: {
      ...meta,
      ...(deletedProviders.length > 0 ? { deletedProviders } : {}),
    },
  };
}

export class ProviderCatalogStore {
  declare _hanakoHome: string;

  constructor(hanakoHome: string) {
    if (!hanakoHome) throw new Error("ProviderCatalogStore requires hanakoHome");
    this._hanakoHome = hanakoHome;
  }

  get catalogPath() {
    return path.join(this._hanakoHome, PROVIDER_CATALOG_FILE);
  }

  load() {
    return this._readExistingCatalog() || normalizeProviderCatalog();
  }

  save(catalog: any) {
    const normalized = normalizeProviderCatalog(catalog);
    writeSecretFileSync(this.catalogPath, JSON.stringify(normalized, null, 2) + "\n");
    return normalized;
  }

  getProviders() {
    return cloneData(this.load().providers);
  }

  saveProviders(providers: Record<string, any>, meta: any = {}) {
    const current = this.load();
    const nextMeta = {
      ...(current.meta || {}),
      ...meta,
    };
    if (Array.isArray(meta.deletedProviders)) {
      nextMeta.deletedProviders = normalizeDeletedProviders(meta.deletedProviders);
    }
    return this.save({
      ...current,
      providers,
      meta: nextMeta,
    });
  }

  getDeletedProviders() {
    return normalizeDeletedProviders(this.load().meta?.deletedProviders);
  }

  _readExistingCatalog() {
    let parsed: any = null;
    try {
      parsed = JSON.parse(readJsonTextWithoutBom(this.catalogPath));
    } catch (err: any) {
      if (err?.code === "ENOENT") return null;
      throw err;
    }
    if (parsed?.catalogVersion !== PROVIDER_CATALOG_VERSION) {
      throw new Error(`Unsupported provider catalog version: ${parsed?.catalogVersion ?? "missing"}`);
    }
    return normalizeProviderCatalog(parsed);
  }
}
