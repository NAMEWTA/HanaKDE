import type { HanaPluginResources } from "@hana/plugin-runtime";

import { isStableId } from "../../domain/ids.ts";
import { appendResourcePath, type WorkspaceTreeRef } from "../workspace/resource-path.ts";
import type { MetadataIndexEntry } from "./metadata-index-repository.ts";

interface TypeRecord { id: string; key: string; name: string; fields: Array<{ id: string; key: string; label: string }> }
interface ContactRecord { id: string; name: string }

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid authority record");
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid authority text");
  return value;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error("invalid authority string array");
  return value as string[];
}

function normalizedSearchText(values: unknown[]): string {
  return values.flatMap((value) => Array.isArray(value) ? value : [value]).filter((value) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    .map(String).join("\n").toLocaleLowerCase();
}

export class IndexAuthorityReader {
  readonly #resources: Pick<HanaPluginResources, "list" | "read">;
  readonly #root: WorkspaceTreeRef;

  constructor(resources: Pick<HanaPluginResources, "list" | "read">, root: WorkspaceTreeRef) {
    this.#resources = resources;
    this.#root = root;
  }

  async #json(path: string): Promise<unknown> {
    const result = await this.#resources.read(appendResourcePath(this.#root, path));
    return JSON.parse(new TextDecoder().decode(result.content)) as unknown;
  }

  async #supportingAuthority(): Promise<{ types: Map<string, TypeRecord>; contacts: Map<string, ContactRecord> }> {
    const typeCatalog = record(await this.#json("Dossiers/types/types.json"));
    const contactCatalog = record(await this.#json("Dossiers/contacts/contacts.json"));
    if (typeCatalog.kind !== "hana.dossiers.type-catalog" || !Array.isArray(typeCatalog.types) || contactCatalog.kind !== "hana.dossiers.contact-catalog" || !Array.isArray(contactCatalog.contacts)) {
      throw new Error("catalog authority is invalid");
    }
    const types = new Map<string, TypeRecord>();
    for (const raw of typeCatalog.types) {
      const value = record(raw);
      if (!isStableId(value.id, "typ") || !Array.isArray(value.fields)) throw new Error("type authority is invalid");
      types.set(value.id, {
        id: value.id, key: text(value.key), name: text(value.name),
        fields: value.fields.map((field) => { const item = record(field); return { id: text(item.id), key: text(item.key), label: text(item.label) }; }),
      });
    }
    const contacts = new Map<string, ContactRecord>();
    for (const raw of contactCatalog.contacts) {
      const value = record(raw);
      if (!isStableId(value.id, "con")) throw new Error("contact authority is invalid");
      contacts.set(value.id, { id: value.id, name: text(value.name) });
    }
    return { types, contacts };
  }

  async #entry(id: string, support: { types: Map<string, TypeRecord>; contacts: Map<string, ContactRecord> }): Promise<MetadataIndexEntry> {
    const dossier = record(await this.#json(`Dossiers/dossiers/${id}/dossier.json`));
    if (dossier.kind !== "hana.dossiers.dossier" || dossier.id !== id || !Number.isInteger(dossier.revision) || !Array.isArray(dossier.documents) || !Array.isArray(dossier.contacts)) {
      throw new Error("dossier authority is invalid");
    }
    const type = support.types.get(text(dossier.typeId));
    if (!type) throw new Error("dossier type reference is invalid");
    const fields = record(dossier.fields);
    const fieldTerms = type.fields.flatMap((field) => [field.key, field.label, fields[field.id]]);
    const contactTerms = dossier.contacts.map((raw) => {
      const relation = record(raw);
      const contact = support.contacts.get(text(relation.contactId));
      if (!contact) throw new Error("dossier contact reference is invalid");
      return [contact.name, text(relation.role)];
    }).flat();
    const documentTerms: string[] = [];
    for (const raw of dossier.documents) {
      const document = record(raw);
      documentTerms.push(text(document.name), text(document.categoryId), ...stringArray(document.tags));
    }
    const name = text(dossier.name);
    const tags = stringArray(dossier.tags);
    return {
      dossierId: id,
      revision: dossier.revision as number,
      name,
      typeName: type.name,
      tags,
      documentCount: dossier.documents.length,
      dossierRef: `Dossiers/dossiers/${id}/dossier.json`,
      searchText: normalizedSearchText([name, type.key, type.name, tags, fieldTerms, contactTerms, documentTerms]),
    };
  }

  async all(): Promise<MetadataIndexEntry[]> {
    const [listing, support] = await Promise.all([
      this.#resources.list(appendResourcePath(this.#root, "Dossiers/dossiers")),
      this.#supportingAuthority(),
    ]);
    const ids = listing.items.filter((item) => item.isDirectory && isStableId(item.name, "dos")).map((item) => item.name).sort();
    const entries: MetadataIndexEntry[] = [];
    for (const id of ids) entries.push(await this.#entry(id, support));
    return entries;
  }

  async one(id: string): Promise<MetadataIndexEntry | null> {
    if (!isStableId(id, "dos")) return null;
    try { return await this.#entry(id, await this.#supportingAuthority()); } catch { return null; }
  }
}
