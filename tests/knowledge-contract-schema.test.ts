import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_SOURCE_AVAILABILITIES,
  KNOWLEDGE_SOURCE_CAPABILITIES,
  KNOWLEDGE_CONTRACT_ISSUE_METADATA,
  KNOWLEDGE_SOURCE_ROLES,
  knowledgeAddressToMarkdownRelativePath,
  parseKnowledgeNativeBridgeCredential,
  parseKnowledgeResourceAddress,
  parseKnowledgeSourceDto,
} from "../shared/knowledge-workspace-contract.ts";

function contractFailure(code: string, field?: string) {
  return {
    ok: false,
    error: {
      code,
      httpStatus: 400,
      retryable: false,
      ...(field === undefined ? {} : { details: { field } }),
    },
  };
}

describe("KnowledgeResourceAddress contract", () => {
  it("KW-US-004 preserves a canonical source-scoped address byte-for-byte", () => {
    const input = {
      sourceKey: "research-2",
      relativePath: "项目/Notes/Ä.md",
    };

    expect(parseKnowledgeResourceAddress(input)).toEqual({
      ok: true,
      value: input,
    });
  });

  it.each([
    ["empty", "", "invalid_relative_path"],
    ["leading slash", "/Notes/A.md", "invalid_relative_path"],
    ["trailing slash", "Notes/A.md/", "invalid_relative_path"],
    ["empty segment", "Notes//A.md", "invalid_relative_path"],
    ["dot segment", "Notes/./A.md", "invalid_relative_path"],
    ["dotdot segment", "Notes/../A.md", "invalid_relative_path"],
    ["NUL", "Notes/\u0000A.md", "invalid_relative_path"],
    ["control", "Notes/\u001fA.md", "invalid_relative_path"],
    ["drive path", "C:/Notes/A.md", "invalid_relative_path"],
    ["UNC path", "\\\\host\\share\\A.md", "invalid_relative_path"],
  ])("rejects a non-canonical %s", (_case, relativePath, code) => {
    expect(
      parseKnowledgeResourceAddress({ sourceKey: "main", relativePath }),
    ).toEqual(contractFailure(code, "relativePath"));
  });

  it("accepts and preserves a literal backslash inside a provider-validated name segment", () => {
    const relativePath = "Notes/a\\b.md";

    expect(
      parseKnowledgeResourceAddress({ sourceKey: "main", relativePath }),
    ).toEqual({
      ok: true,
      value: { sourceKey: "main", relativePath },
    });
  });

  it("KW-US-163 rejects paths that attempt to escape the source scope", () => {
    expect(
      parseKnowledgeResourceAddress({
        sourceKey: "main",
        relativePath: "Notes/../../private.md",
      }),
    ).toEqual(contractFailure("invalid_relative_path", "relativePath"));
  });

  it.each(["Main", "2main", "main_source", "main.", "a".repeat(33)])(
    "rejects invalid sourceKey %j",
    (sourceKey) => {
      expect(
        parseKnowledgeResourceAddress({
          sourceKey,
          relativePath: "Notes/A.md",
        }),
      ).toEqual(contractFailure("invalid_source_key", "sourceKey"));
    },
  );

  it("does not percent-decode, Unicode-normalize, case-fold, or remove extensions", () => {
    const relativePath = "Notes/%2e%2e/e\u0301.MD";

    expect(
      parseKnowledgeResourceAddress({ sourceKey: "main", relativePath }),
    ).toEqual({
      ok: true,
      value: { sourceKey: "main", relativePath },
    });
  });

  it.each([
    "principal",
    "userId",
    "studioId",
    "owner",
    "ownerId",
    "scope",
    "scopeToken",
    "resolvedPath",
    "filePath",
    "rootIdentity",
    "nativeToken",
  ])("rejects client-supplied sensitive field %s", (field) => {
    expect(
      parseKnowledgeResourceAddress({
        sourceKey: "main",
        relativePath: "Notes/A.md",
        [field]: "forged",
      }),
    ).toEqual(contractFailure("forbidden_contract_field", field));
  });

  it("rejects unknown extra fields and non-object input fail-closed", () => {
    expect(
      parseKnowledgeResourceAddress({
        sourceKey: "main",
        relativePath: "Notes/A.md",
        extra: true,
      }),
    ).toEqual(contractFailure("unexpected_field", "extra"));
    expect(parseKnowledgeResourceAddress(null)).toEqual(
      contractFailure("invalid_contract_value"),
    );
  });

  it("KW-US-004 projects only the source-root relative path into Markdown", () => {
    const address = {
      sourceKey: "research",
      relativePath: "项目/Notes/A.md",
    };
    const markdownPath = knowledgeAddressToMarkdownRelativePath(address);

    expect(markdownPath).toBe("项目/Notes/A.md");
    expect(markdownPath).not.toContain(address.sourceKey);
    expect(markdownPath).not.toContain("/Users/");
    expect(markdownPath).not.toContain("Research Workspace");
  });
});

describe("KnowledgeNativeBridgeCredential contract", () => {
  const validCredential = "A".repeat(43);

  it("KW-US-164 accepts exactly one 32-byte base64url credential", () => {
    expect(parseKnowledgeNativeBridgeCredential(validCredential)).toEqual({
      ok: true,
      value: validCredential,
    });
  });

  it.each([
    ["short", "A".repeat(42)],
    ["long", "A".repeat(44)],
    ["base64 plus", `${"A".repeat(42)}+`],
    ["base64 slash", `${"A".repeat(42)}/`],
    ["padding", `${"A".repeat(42)}=`],
    ["non-string", new Uint8Array(32)],
  ])("rejects invalid native credential %s with stable metadata", (_case, input) => {
    expect(parseKnowledgeNativeBridgeCredential(input)).toEqual(
      contractFailure("invalid_native_bridge_credential"),
    );
  });

  it("never admits the Main-only credential into address or source DTOs", () => {
    expect(
      parseKnowledgeResourceAddress({
        sourceKey: "main",
        relativePath: "Notes/A.md",
        nativeBridgeCredential: validCredential,
      }),
    ).toEqual(
      contractFailure(
        "forbidden_contract_field",
        "nativeBridgeCredential",
      ),
    );
    expect(
      parseKnowledgeSourceDto({
        sourceKey: "main",
        displayName: "Main",
        role: "main",
        capabilities: ["read"],
        availability: "available",
        nativeBridgeCredential: validCredential,
      }),
    ).toEqual(
      contractFailure(
        "forbidden_contract_field",
        "nativeBridgeCredential",
      ),
    );
  });
});

describe("KnowledgeSourceDto contract", () => {
  it("KW-US-009 freezes strict remote-safe source whitelists and issue metadata", () => {
    expect(KNOWLEDGE_SOURCE_ROLES).toEqual(["main", "mounted"]);
    expect(KNOWLEDGE_SOURCE_CAPABILITIES).toEqual([
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
    ]);
    expect(KNOWLEDGE_SOURCE_AVAILABILITIES).toEqual([
      "available",
      "unavailable",
      "recovering",
    ]);
    expect(
      Object.values(KNOWLEDGE_CONTRACT_ISSUE_METADATA).every(
        (metadata) =>
          metadata.httpStatus === 400 &&
          metadata.retryable === false &&
          /^[a-z][a-z0-9_]*$/.test(metadata.code),
      ),
    ).toBe(true);
  });

  it.each(KNOWLEDGE_SOURCE_AVAILABILITIES)(
    "accepts the remote-safe source projection when availability=%s",
    (availability) => {
      const input = {
        sourceKey: "main",
        displayName: "Main Workspace",
        role: "main",
        capabilities: ["stat", "read", "write", "list"],
        availability,
      };

      expect(parseKnowledgeSourceDto(input)).toEqual({
        ok: true,
        value: input,
      });
    },
  );

  it.each([
    ["role", "primary", "invalid_source_role"],
    ["availability", "online", "invalid_source_availability"],
  ])("rejects a non-whitelisted %s", (field, value, code) => {
    expect(
      parseKnowledgeSourceDto({
        sourceKey: "main",
        displayName: "Main",
        role: field === "role" ? value : "main",
        capabilities: ["read"],
        availability: field === "availability" ? value : "available",
      }),
    ).toEqual(contractFailure(code, field));
  });

  it("rejects unknown and duplicate capabilities deterministically", () => {
    const base = {
      sourceKey: "main",
      displayName: "Main",
      role: "main",
      availability: "available",
    };

    expect(
      parseKnowledgeSourceDto({ ...base, capabilities: ["read", "execute"] }),
    ).toEqual(
      contractFailure("invalid_source_capability", "capabilities[1]"),
    );
    expect(
      parseKnowledgeSourceDto({ ...base, capabilities: ["read", "read"] }),
    ).toEqual(
      contractFailure("duplicate_source_capability", "capabilities[1]"),
    );
  });

  it.each(["path", "content", "credential", "rootIdentity", "scopeToken"])(
    "never admits remote-sensitive source field %s",
    (field) => {
      expect(
        parseKnowledgeSourceDto({
          sourceKey: "main",
          displayName: "Main",
          role: "main",
          capabilities: ["read"],
          availability: "available",
          [field]: "secret",
        }),
      ).toEqual(contractFailure("forbidden_contract_field", field));
    },
  );

  it.each([
    "/Users/alice/Notes",
    "C:\\Users\\alice\\Notes",
    "D:/Notes",
    "\\\\server\\share\\Notes",
    "file:///Users/alice/Notes",
    "FILE://server/share/Notes",
    " /Users/alice/Notes",
    " C:\\Users\\alice\\Notes",
    " file:///Users/alice/Notes",
    "Research (/Users/alice/Notes)",
    "Research — C:\\Users\\alice\\Notes",
    "Research [\\\\server\\share\\Notes]",
    "Research (file:///Users/alice/Notes)",
    "root=/srv/notes",
    "Research|/Users/alice/Notes",
    "Research_/srv/knowledge",
    "Label|C:\\Users\\alice\\Notes",
    "Research🙂/Users/alice/Notes",
    "Label.C:\\Users\\alice\\Notes",
    "Friendly@file:///Users/alice/Notes",
    "Research\u200B/Users/alice/Notes",
    "Research/\u200BUsers/alice/Notes",
    "Research•/Users/alice/Notes",
    "Label“C:\\Users\\alice\\Notes”",
    "Research \\Users\\alice\\Notes",
  ])("KW-US-009 rejects absolute-path displayName %j", (displayName) => {
    expect(
      parseKnowledgeSourceDto({
        sourceKey: "research",
        displayName,
        role: "mounted",
        capabilities: ["read"],
        availability: "available",
      }),
    ).toEqual(contractFailure("invalid_display_name", "displayName"));
  });

  it.each([
    "Research / Notes",
    "Research \\ Notes",
    "Paths / Overview",
    "C: language notes",
    "Label.C: Users",
    "File URL reference",
    "Server share overview",
    "Research (mounted)",
  ])("accepts ordinary non-path displayName %j", (displayName) => {
    expect(
      parseKnowledgeSourceDto({
        sourceKey: "research",
        displayName,
        role: "mounted",
        capabilities: ["read"],
        availability: "available",
      }),
    ).toEqual({
      ok: true,
      value: {
        sourceKey: "research",
        displayName,
        role: "mounted",
        capabilities: ["read"],
        availability: "available",
      },
    });
  });

  it.each([
    ["main", "mounted"],
    ["research", "main"],
  ])(
    "requires sourceKey=main iff role=main (%s/%s)",
    (sourceKey, role) => {
      expect(
        parseKnowledgeSourceDto({
          sourceKey,
          displayName: "Workspace",
          role,
          capabilities: ["read"],
          availability: "available",
        }),
      ).toEqual(contractFailure("source_role_mismatch", "role"));
    },
  );
});
