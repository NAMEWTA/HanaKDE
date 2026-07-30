import {
  parseKnowledgeResourceAddress,
  type KnowledgeResourceAddress,
} from "../../../../shared/knowledge-workspace-contract.ts";
import type {
  MarkdownAttachmentInsertResult,
  MarkdownEditorSurfacePolicy,
} from "../components/preview/MarkdownEditorSurface";

export type KnowledgeResourceAttachmentItem = Readonly<{
  sourceAddress: KnowledgeResourceAddress;
  kind: "page" | "attachment";
}>;

export type KnowledgeExternalAttachmentItem = Readonly<{
  file: File;
  kind: "attachment";
}>;

export type KnowledgeAttachmentItem =
  | KnowledgeResourceAttachmentItem
  | KnowledgeExternalAttachmentItem;

export const KNOWLEDGE_ATTACHMENT_RESOURCE_MIME =
  "application/x-hanako-knowledge-editor-resources+json";

export type KnowledgeAttachmentCopyResult = Readonly<{
  copied: boolean;
  targetAddress: KnowledgeResourceAddress;
  bytesTransferred: number;
  embed: boolean;
  originalName: string;
}>;

export type KnowledgeAttachmentCopyForEditor = (
  item: KnowledgeResourceAttachmentItem,
  options: Readonly<{
    pageAddress: KnowledgeResourceAddress;
    localDate: string;
    signal: AbortSignal;
  }>,
) => Promise<KnowledgeAttachmentCopyResult>;

export type KnowledgeExternalAttachmentCopyForEditor = (
  item: KnowledgeExternalAttachmentItem,
  options: Readonly<{
    pageAddress: KnowledgeResourceAddress;
    localDate: string;
    signal: AbortSignal;
  }>,
) => Promise<KnowledgeAttachmentCopyResult>;

export interface KnowledgeAttachmentPolicyConfig {
  pageAddress: KnowledgeResourceAddress;
  writable?: boolean;
  readItems(
    dataTransfer: DataTransfer | null,
  ): readonly KnowledgeAttachmentItem[];
  copyForEditor: KnowledgeAttachmentCopyForEditor;
  copyExternalForEditor?: KnowledgeExternalAttachmentCopyForEditor;
  localDate?: () => string;
  signal?: AbortSignal;
  onItemError?: (item: KnowledgeAttachmentItem, error: unknown) => void;
}

export type KnowledgeAttachmentPolicy = Omit<
  NonNullable<MarkdownEditorSurfacePolicy["attachment"]>,
  "insert"
> & {
  insert(
    dataTransfer: DataTransfer | null,
  ): Promise<MarkdownAttachmentInsertResult>;
};

export function createKnowledgeAttachmentPolicy(
  config: KnowledgeAttachmentPolicyConfig & { writable: false },
): null;
export function createKnowledgeAttachmentPolicy(
  config: KnowledgeAttachmentPolicyConfig & { writable?: true },
): KnowledgeAttachmentPolicy;
export function createKnowledgeAttachmentPolicy(
  config: KnowledgeAttachmentPolicyConfig,
): KnowledgeAttachmentPolicy | null;
export function createKnowledgeAttachmentPolicy(
  config: KnowledgeAttachmentPolicyConfig,
): KnowledgeAttachmentPolicy | null {
  const pageAddress = validateAddress(config.pageAddress);
  if (!pageAddress || config.writable === false) return null;

  const readItems = (
    dataTransfer: DataTransfer | null,
  ): KnowledgeAttachmentItem[] => {
    try {
      const items = config.readItems(dataTransfer);
      if (!Array.isArray(items)) return [];
      const validated: KnowledgeAttachmentItem[] = [];
      for (const item of items) {
        if (isExternalItem(item)) {
          if (!config.copyExternalForEditor) return [];
          validated.push(Object.freeze({
            file: item.file,
            kind: "attachment",
          }));
          continue;
        }
        const address = validateAddress(item?.sourceAddress);
        if (!address || (item.kind !== "page" && item.kind !== "attachment")) {
          return [];
        }
        validated.push(Object.freeze({
          sourceAddress: Object.freeze({ ...address }),
          kind: item.kind,
        }));
      }
      return validated;
    } catch {
      return [];
    }
  };

  const executeBatch = async (
    batch: readonly KnowledgeAttachmentItem[],
  ): Promise<MarkdownAttachmentInsertResult> => {
    if (batch.length === 0) return { markdown: "" };
    const markdown: string[] = [];
    const localDate = (config.localDate ?? currentLocalDate)();
    const controller = new AbortController();
    const abort = () => controller.abort(config.signal?.reason);
    if (config.signal?.aborted) abort();
    else config.signal?.addEventListener("abort", abort, { once: true });
    try {
      for (const item of batch) {
        if (controller.signal.aborted) break;
        try {
          const options = {
            pageAddress,
            localDate,
            signal: controller.signal,
          };
          const result = isExternalItem(item)
            ? await config.copyExternalForEditor!(item, options)
            : await config.copyForEditor(item, options);
          if (
            result.targetAddress.sourceKey !== pageAddress.sourceKey
            || !validateAddress(result.targetAddress)
          ) {
            throw new Error("knowledge attachment copy returned an invalid target");
          }
          markdown.push(formatWikilink(
            result.targetAddress.relativePath,
            result.embed,
          ));
        } catch (error) {
          if (controller.signal.aborted) break;
          config.onItemError?.(item, error);
        }
      }
    } finally {
      config.signal?.removeEventListener("abort", abort);
    }
    const frozenBatch = batch.map(item => (
      isExternalItem(item)
        ? Object.freeze({ file: item.file, kind: "attachment" as const })
        : Object.freeze({
            sourceAddress: Object.freeze({ ...item.sourceAddress }),
            kind: item.kind,
          })
    ));
    return {
      markdown: markdown.join("\n"),
      redo: () => executeBatch(frozenBatch),
    };
  };

  return {
    accepts(dataTransfer) {
      return readItems(dataTransfer).length > 0;
    },
    insert(dataTransfer) {
      return executeBatch(readItems(dataTransfer));
    },
  };
}

export function readKnowledgeAttachmentResourceItems(
  dataTransfer: DataTransfer | null,
): KnowledgeAttachmentItem[] {
  if (!dataTransfer) return [];
  let raw = "";
  try {
    raw = dataTransfer.getData(KNOWLEDGE_ATTACHMENT_RESOURCE_MIME);
  } catch {
    return [];
  }
  if (!raw || raw.length > 128 * 1024) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 100) {
    return [];
  }
  const items: KnowledgeAttachmentItem[] = [];
  for (const input of parsed) {
    if (
      typeof input !== "object"
      || input === null
      || Array.isArray(input)
      || Object.keys(input).some(key => !["sourceAddress", "kind"].includes(key))
    ) {
      return [];
    }
    const item = input as Record<string, unknown>;
    const address = validateAddress(item.sourceAddress);
    if (
      !address
      || (item.kind !== "page" && item.kind !== "attachment")
    ) {
      return [];
    }
    items.push(Object.freeze({
      sourceAddress: Object.freeze({ ...address }),
      kind: item.kind,
    }));
  }
  return items;
}

export function readKnowledgeAttachmentItems(
  dataTransfer: DataTransfer | null,
): KnowledgeAttachmentItem[] {
  const resources = readKnowledgeAttachmentResourceItems(dataTransfer);
  if (resources.length > 0) return resources;
  if (!dataTransfer?.files) return [];
  return Array.from(dataTransfer.files)
    .filter(file => file && typeof file.name === "string")
    .map(file => Object.freeze({
      file,
      kind: "attachment" as const,
    }));
}

function validateAddress(
  input: unknown,
): KnowledgeResourceAddress | null {
  const parsed = parseKnowledgeResourceAddress(input);
  return parsed.ok && parsed.value.relativePath.length > 0
    ? parsed.value
    : null;
}

function currentLocalDate(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatWikilink(relativePath: string, embed: boolean): string {
  return `${embed ? "!" : ""}[[${relativePath}]]`;
}

function isExternalItem(
  item: KnowledgeAttachmentItem,
): item is KnowledgeExternalAttachmentItem {
  if (
    typeof item !== "object"
    || item === null
    || !("file" in item)
    || item.kind !== "attachment"
  ) {
    return false;
  }
  const file = item.file;
  return typeof file === "object"
    && file !== null
    && typeof file.name === "string"
    && typeof file.size === "number"
    && Number.isSafeInteger(file.size)
    && file.size >= 0;
}
