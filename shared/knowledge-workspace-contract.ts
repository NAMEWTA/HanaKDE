export const KNOWLEDGE_SOURCE_ROLES = ["main", "mounted"] as const;
export const KNOWLEDGE_MARKDOWN_MAX_BYTES = 10 * 1024 * 1024;

export const KNOWLEDGE_SOURCE_CAPABILITIES = [
  "stat",
  "read",
  "write",
  "list",
  "watch",
  "mkdir",
  "copy",
  "transfer",
  "rename",
  "move",
  "delete",
  "trash",
  "restore",
  "search",
] as const;

export const KNOWLEDGE_SOURCE_AVAILABILITIES = [
  "available",
  "unavailable",
  "recovering",
] as const;

export type KnowledgeSourceRole = (typeof KNOWLEDGE_SOURCE_ROLES)[number];
export type KnowledgeSourceCapability =
  (typeof KNOWLEDGE_SOURCE_CAPABILITIES)[number];
export type KnowledgeSourceAvailability =
  (typeof KNOWLEDGE_SOURCE_AVAILABILITIES)[number];

export type KnowledgeResourceAddress = {
  sourceKey: string;
  relativePath: string;
};

declare const KNOWLEDGE_NATIVE_BRIDGE_CREDENTIAL_BRAND: unique symbol;
export type KnowledgeNativeBridgeCredential = string & {
  readonly [KNOWLEDGE_NATIVE_BRIDGE_CREDENTIAL_BRAND]: true;
};

export type KnowledgeSourceDto = {
  sourceKey: string;
  displayName: string;
  role: KnowledgeSourceRole;
  capabilities: KnowledgeSourceCapability[];
  availability: KnowledgeSourceAvailability;
};

export type KnowledgeContractErrorCode =
  | "invalid_contract_value"
  | "unexpected_field"
  | "forbidden_contract_field"
  | "invalid_source_key"
  | "invalid_relative_path"
  | "invalid_display_name"
  | "invalid_source_role"
  | "invalid_source_capabilities"
  | "invalid_source_capability"
  | "duplicate_source_capability"
  | "invalid_source_availability"
  | "source_role_mismatch"
  | "invalid_native_bridge_credential";

export type KnowledgeContractError = {
  code: KnowledgeContractErrorCode;
  httpStatus: 400;
  retryable: false;
  details?: Readonly<{ field: string }>;
};

export type KnowledgeContractParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: KnowledgeContractError };

const SOURCE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const WINDOWS_DRIVE_PATH_PATTERN = /^[a-zA-Z]:/;
// Display names are prose, not resource locators. Match native locator forms
// anywhere instead of attempting to enumerate every possible prefix character.
// For POSIX fragments, a slash is path-like only when its next character is
// neither whitespace nor the same separator. The symmetric backslash rule
// catches rooted Windows fragments while keeping "Research \ Notes" valid.
const DISPLAY_WINDOWS_DRIVE_PATH_PATTERN = /[A-Za-z]:[\\/]/u;
const DISPLAY_POSIX_ABSOLUTE_PATH_PATTERN = /\/[^\s/]/u;
const DISPLAY_WINDOWS_ROOT_PATH_PATTERN = /\\[^\s\\]/u;
const DISPLAY_UNC_PATH_PATTERN =
  /(?:\\\\|\/\/)[^\s\\/]+[\\/][^\s\\/]+/u;
const DISPLAY_FILE_URL_PATTERN = /file:\/\//iu;
const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;
const NATIVE_BRIDGE_CREDENTIAL_PATTERN =
  /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

export type KnowledgeContractIssueMetadata = Readonly<{
  code: KnowledgeContractErrorCode;
  httpStatus: 400;
  retryable: false;
}>;

function issueMetadata(
  code: KnowledgeContractErrorCode,
): KnowledgeContractIssueMetadata {
  return Object.freeze({ code, httpStatus: 400, retryable: false });
}

export const KNOWLEDGE_CONTRACT_ISSUE_METADATA = Object.freeze({
  invalid_contract_value: issueMetadata("invalid_contract_value"),
  unexpected_field: issueMetadata("unexpected_field"),
  forbidden_contract_field: issueMetadata("forbidden_contract_field"),
  invalid_source_key: issueMetadata("invalid_source_key"),
  invalid_relative_path: issueMetadata("invalid_relative_path"),
  invalid_display_name: issueMetadata("invalid_display_name"),
  invalid_source_role: issueMetadata("invalid_source_role"),
  invalid_source_capabilities: issueMetadata("invalid_source_capabilities"),
  invalid_source_capability: issueMetadata("invalid_source_capability"),
  duplicate_source_capability: issueMetadata("duplicate_source_capability"),
  invalid_source_availability: issueMetadata("invalid_source_availability"),
  source_role_mismatch: issueMetadata("source_role_mismatch"),
  invalid_native_bridge_credential: issueMetadata(
    "invalid_native_bridge_credential",
  ),
} satisfies Record<KnowledgeContractErrorCode, KnowledgeContractIssueMetadata>);

const ADDRESS_FIELDS = new Set(["sourceKey", "relativePath"]);
const SOURCE_DTO_FIELDS = new Set([
  "sourceKey",
  "displayName",
  "role",
  "capabilities",
  "availability",
]);

const FORBIDDEN_CONTRACT_FIELDS = new Set([
  "principal",
  "principalId",
  "userId",
  "studioId",
  "owner",
  "ownerId",
  "scope",
  "scopeToken",
  "sessionId",
  "windowId",
  "resolvedPath",
  "filePath",
  "absolutePath",
  "path",
  "root",
  "rootId",
  "rootIdentity",
  "opaqueRootId",
  "identityNamespace",
  "nativeToken",
  "nativeBridgeToken",
  "nativeBridgeCredential",
  "token",
  "credential",
  "credentials",
  "content",
]);

const SOURCE_ROLE_SET = new Set<string>(KNOWLEDGE_SOURCE_ROLES);
const SOURCE_CAPABILITY_SET = new Set<string>(
  KNOWLEDGE_SOURCE_CAPABILITIES,
);
const SOURCE_AVAILABILITY_SET = new Set<string>(
  KNOWLEDGE_SOURCE_AVAILABILITIES,
);

function failure(
  code: KnowledgeContractErrorCode,
  field?: string,
): { ok: false; error: KnowledgeContractError } {
  const metadata = KNOWLEDGE_CONTRACT_ISSUE_METADATA[code];
  return {
    ok: false,
    error: field === undefined
      ? metadata
      : Object.freeze({
          ...metadata,
          details: Object.freeze({ field }),
        }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowedFields: ReadonlySet<string>,
): { ok: false; error: KnowledgeContractError } | undefined {
  for (const field of Object.keys(value)) {
    if (allowedFields.has(field)) {
      continue;
    }
    return failure(
      FORBIDDEN_CONTRACT_FIELDS.has(field)
        ? "forbidden_contract_field"
        : "unexpected_field",
      field,
    );
  }
  return undefined;
}

function isValidSourceKey(value: unknown): value is string {
  return typeof value === "string" && SOURCE_KEY_PATTERN.test(value);
}

function isCanonicalRelativePath(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.startsWith("\\") ||
    value.endsWith("/") ||
    WINDOWS_DRIVE_PATH_PATTERN.test(value) ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return false;
  }

  const segments = value.split("/");
  return segments.every(
    (segment) =>
      segment.length > 0 &&
      segment !== "." &&
      segment !== "..",
  );
}

export function parseKnowledgeResourceAddress(
  input: unknown,
): KnowledgeContractParseResult<KnowledgeResourceAddress> {
  if (!isRecord(input)) {
    return failure("invalid_contract_value");
  }

  const unknownField = rejectUnknownFields(input, ADDRESS_FIELDS);
  if (unknownField !== undefined) {
    return unknownField;
  }
  if (!isValidSourceKey(input.sourceKey)) {
    return failure("invalid_source_key", "sourceKey");
  }
  if (!isCanonicalRelativePath(input.relativePath)) {
    return failure("invalid_relative_path", "relativePath");
  }

  return {
    ok: true,
    value: {
      sourceKey: input.sourceKey,
      relativePath: input.relativePath,
    },
  };
}

export function knowledgeAddressToMarkdownRelativePath(
  address: KnowledgeResourceAddress,
): string {
  return address.relativePath;
}

export function parseKnowledgeNativeBridgeCredential(
  input: unknown,
): KnowledgeContractParseResult<KnowledgeNativeBridgeCredential> {
  if (
    typeof input !== "string"
    || !NATIVE_BRIDGE_CREDENTIAL_PATTERN.test(input)
  ) {
    return failure("invalid_native_bridge_credential");
  }
  return {
    ok: true,
    value: input as KnowledgeNativeBridgeCredential,
  };
}

export function parseKnowledgeSourceDto(
  input: unknown,
): KnowledgeContractParseResult<KnowledgeSourceDto> {
  if (!isRecord(input)) {
    return failure("invalid_contract_value");
  }

  const unknownField = rejectUnknownFields(input, SOURCE_DTO_FIELDS);
  if (unknownField !== undefined) {
    return unknownField;
  }
  if (!isValidSourceKey(input.sourceKey)) {
    return failure("invalid_source_key", "sourceKey");
  }
  if (
    typeof input.displayName !== "string" ||
    input.displayName.length === 0 ||
    DISPLAY_WINDOWS_DRIVE_PATH_PATTERN.test(input.displayName) ||
    DISPLAY_POSIX_ABSOLUTE_PATH_PATTERN.test(input.displayName) ||
    DISPLAY_WINDOWS_ROOT_PATH_PATTERN.test(input.displayName) ||
    DISPLAY_UNC_PATH_PATTERN.test(input.displayName) ||
    DISPLAY_FILE_URL_PATTERN.test(input.displayName) ||
    CONTROL_CHARACTER_PATTERN.test(input.displayName)
  ) {
    return failure("invalid_display_name", "displayName");
  }
  if (
    typeof input.role !== "string" ||
    !SOURCE_ROLE_SET.has(input.role)
  ) {
    return failure("invalid_source_role", "role");
  }
  if (!Array.isArray(input.capabilities)) {
    return failure("invalid_source_capabilities", "capabilities");
  }

  const capabilities: KnowledgeSourceCapability[] = [];
  const seenCapabilities = new Set<KnowledgeSourceCapability>();
  for (const [index, capability] of input.capabilities.entries()) {
    const field = `capabilities[${index}]`;
    if (
      typeof capability !== "string" ||
      !SOURCE_CAPABILITY_SET.has(capability)
    ) {
      return failure("invalid_source_capability", field);
    }
    const validatedCapability = capability as KnowledgeSourceCapability;
    if (seenCapabilities.has(validatedCapability)) {
      return failure("duplicate_source_capability", field);
    }
    seenCapabilities.add(validatedCapability);
    capabilities.push(validatedCapability);
  }

  if (
    typeof input.availability !== "string" ||
    !SOURCE_AVAILABILITY_SET.has(input.availability)
  ) {
    return failure("invalid_source_availability", "availability");
  }
  if ((input.sourceKey === "main") !== (input.role === "main")) {
    return failure("source_role_mismatch", "role");
  }

  return {
    ok: true,
    value: {
      sourceKey: input.sourceKey,
      displayName: input.displayName,
      role: input.role as KnowledgeSourceRole,
      capabilities,
      availability: input.availability as KnowledgeSourceAvailability,
    },
  };
}
