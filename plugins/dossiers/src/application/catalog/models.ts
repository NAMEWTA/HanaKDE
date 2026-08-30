export const CATALOG_SCHEMA_VERSION = 1 as const;

export type FieldType =
  | "text"
  | "long_text"
  | "number"
  | "date"
  | "boolean"
  | "enum"
  | "url"
  | "email"
  | "phone";

export type FieldValue = string | number | boolean | null;

export interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  order: number;
  required: boolean;
  options?: string[];
  extensions?: Record<string, unknown>;
}

export interface DossierTypeRecord {
  kind: "hana.dossiers.dossier-type";
  schemaVersion: number;
  id: string;
  key: string;
  name: string;
  builtin: boolean;
  fields: FieldDefinition[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  extensions: Record<string, unknown>;
}

export interface TypeCatalogRecord {
  kind: "hana.dossiers.type-catalog";
  schemaVersion: number;
  revision: number;
  types: DossierTypeRecord[];
  createdAt: string;
  updatedAt: string;
  extensions: Record<string, unknown>;
}

export interface ContactRecord {
  kind: "hana.dossiers.contact";
  schemaVersion: number;
  id: string;
  name: string;
  organization?: string;
  title?: string;
  emails: string[];
  phones: string[];
  notes?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  extensions: Record<string, unknown>;
}

export interface ContactCatalogRecord {
  kind: "hana.dossiers.contact-catalog";
  schemaVersion: number;
  revision: number;
  contacts: ContactRecord[];
  createdAt: string;
  updatedAt: string;
  extensions: Record<string, unknown>;
}

export interface ContactRelation {
  contactId: string;
  role: string;
  extensions: Record<string, unknown>;
}

export interface DossierRecord {
  kind: "hana.dossiers.dossier";
  schemaVersion: number;
  id: string;
  name: string;
  typeId: string;
  fields: Record<string, FieldValue>;
  tags: string[];
  contacts: ContactRelation[];
  documents: unknown[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  extensions: Record<string, unknown>;
}

export interface DossierProjection extends DossierRecord {
  type: DossierTypeRecord;
  contacts: Array<ContactRelation & { contact: ContactRecord }>;
  dossierRef: string;
}

const FIELD_TYPES = new Set<FieldType>([
  "text",
  "long_text",
  "number",
  "date",
  "boolean",
  "enum",
  "url",
  "email",
  "phone",
]);
const SAFE_KEY = /^[a-z][a-z0-9_-]{1,63}$/;
const FIELD_ID = /^fld_[a-z0-9][a-z0-9_-]{7,63}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+()0-9][+()0-9 .-]{2,63}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertText(value: unknown, field: string, maxLength = 240): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`${field} must be a non-empty string no longer than ${maxLength} characters`);
  }
}

export function normalizedName(value: unknown, field = "name"): string {
  assertText(value, field);
  return value.trim();
}

export function normalizedKey(value: unknown, field = "key"): string {
  if (typeof value !== "string" || !SAFE_KEY.test(value)) {
    throw new Error(`${field} must be a stable lowercase key`);
  }
  return value;
}

export function normalizedStringList(value: unknown, field: string, itemMaxLength = 240): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  const result = value.map((item) => {
    assertText(item, field, itemMaxLength);
    return item.trim();
  });
  return [...new Set(result)];
}

export function validateFieldDefinitions(value: unknown): FieldDefinition[] {
  if (!Array.isArray(value)) throw new Error("fields must be an array");
  const ids = new Set<string>();
  const keys = new Set<string>();
  const orders = new Set<number>();
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`fields[${index}] must be an object`);
    const field = item as Record<string, unknown>;
    if (typeof field.id !== "string" || !FIELD_ID.test(field.id)) throw new Error(`fields[${index}].id must be stable`);
    const key = normalizedKey(field.key, `fields[${index}].key`);
    const label = normalizedName(field.label, `fields[${index}].label`);
    if (typeof field.type !== "string" || !FIELD_TYPES.has(field.type as FieldType)) throw new Error(`fields[${index}].type is unsupported`);
    if (!Number.isInteger(field.order) || (field.order as number) < 0) throw new Error(`fields[${index}].order must be a non-negative integer`);
    if (typeof field.required !== "boolean") throw new Error(`fields[${index}].required must be boolean`);
    if (ids.has(field.id) || keys.has(key) || orders.has(field.order as number)) throw new Error("field ids, keys, and order values must be unique");
    ids.add(field.id);
    keys.add(key);
    orders.add(field.order as number);
    let options: string[] | undefined;
    if (field.type === "enum") {
      options = normalizedStringList(field.options, `fields[${index}].options`, 120);
      if (options.length === 0) throw new Error(`fields[${index}].options must not be empty`);
    } else if (field.options !== undefined) {
      throw new Error(`fields[${index}].options is only valid for enum fields`);
    }
    return {
      id: field.id,
      key,
      label,
      type: field.type as FieldType,
      order: field.order as number,
      required: field.required,
      ...(options ? { options } : {}),
      extensions: field.extensions && typeof field.extensions === "object" && !Array.isArray(field.extensions)
        ? { ...field.extensions as Record<string, unknown> }
        : {},
    };
  }).sort((a, b) => a.order - b.order);
}

function validDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

function validateFieldValue(field: FieldDefinition, value: unknown): value is FieldValue {
  if (value === null) return !field.required;
  switch (field.type) {
    case "text": return typeof value === "string" && value.length <= 2_000;
    case "long_text": return typeof value === "string" && value.length <= 100_000;
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "date": return typeof value === "string" && validDate(value);
    case "boolean": return typeof value === "boolean";
    case "enum": return typeof value === "string" && Boolean(field.options?.includes(value));
    case "url": {
      if (typeof value !== "string" || value.length > 2_000) return false;
      try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch {
        return false;
      }
    }
    case "email": return typeof value === "string" && value.length <= 320 && EMAIL.test(value);
    case "phone": return typeof value === "string" && PHONE.test(value);
  }
}

export function validateFieldValues(type: DossierTypeRecord, value: unknown): Record<string, FieldValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("fields must be an object");
  const input = value as Record<string, unknown>;
  const definitions = new Map(type.fields.map((field) => [field.id, field]));
  for (const key of Object.keys(input)) {
    if (!definitions.has(key)) throw new Error("fields contains an unknown field id");
  }
  for (const field of type.fields) {
    const fieldValue = input[field.id];
    if (fieldValue === undefined) {
      if (field.required) throw new Error(`required field ${field.id} is missing`);
      continue;
    }
    if (!validateFieldValue(field, fieldValue)) throw new Error(`field ${field.id} has an invalid value`);
  }
  return { ...input } as Record<string, FieldValue>;
}

export function builtinTypes(now: string): DossierTypeRecord[] {
  const create = (id: string, key: string, name: string, fields: FieldDefinition[]): DossierTypeRecord => ({
    kind: "hana.dossiers.dossier-type",
    schemaVersion: CATALOG_SCHEMA_VERSION,
    id,
    key,
    name,
    builtin: true,
    fields,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    extensions: {},
  });
  return [
    create("typ_builtin_person", "person", "个人", [
      { id: "fld_person_birth_date", key: "birth_date", label: "出生日期", type: "date", order: 0, required: false, extensions: {} },
      { id: "fld_person_email", key: "email", label: "邮箱", type: "email", order: 1, required: false, extensions: {} },
      { id: "fld_person_phone", key: "phone", label: "电话", type: "phone", order: 2, required: false, extensions: {} },
    ]),
    create("typ_builtin_organization", "organization", "组织", [
      { id: "fld_org_registration", key: "registration_number", label: "登记编号", type: "text", order: 0, required: false, extensions: {} },
      { id: "fld_org_website", key: "website", label: "网站", type: "url", order: 1, required: false, extensions: {} },
      { id: "fld_org_address", key: "address", label: "地址", type: "long_text", order: 2, required: false, extensions: {} },
    ]),
    create("typ_builtin_project", "project", "项目", [
      { id: "fld_project_status", key: "status", label: "状态", type: "enum", order: 0, required: false, options: ["planned", "active", "paused", "completed"], extensions: {} },
      { id: "fld_project_start", key: "start_date", label: "开始日期", type: "date", order: 1, required: false, extensions: {} },
      { id: "fld_project_end", key: "end_date", label: "结束日期", type: "date", order: 2, required: false, extensions: {} },
    ]),
  ];
}
