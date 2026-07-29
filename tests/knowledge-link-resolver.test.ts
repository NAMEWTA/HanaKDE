import { describe, expect, it } from "vitest";
import {
  canonicalKnowledgeAddress,
  canonicalKnowledgeRelativePath,
} from "../lib/knowledge-workspace/knowledge-address.ts";
import {
  formatKnowledgeMarkdownDestination,
  formatKnowledgeWikilink,
  resolveKnowledgeMarkdownDestination,
  resolveKnowledgeWikilink,
} from "../lib/knowledge-workspace/link-resolver.ts";
import {
  parseMarkdownKnowledgeIr,
} from "../lib/knowledge-workspace/markdown-knowledge-ir.ts";

const PAGE = {
  sourceKey: "main",
  relativePath: "Notes/Current Page.md",
} as const;

describe("knowledge address", () => {
  it("accepts canonical source-relative paths without normalizing their real spelling", () => {
    const values = [
      "A.md",
      "Projects/A.tar.gz",
      "Notes/Café.md",
      "Notes/Cafe\u0301.md",
      "Notes/设计.md",
      "Notes/%20.md",
    ];

    for (const value of values) {
      expect(canonicalKnowledgeRelativePath(value)).toEqual({
        ok: true,
        value,
      });
    }
    expect(canonicalKnowledgeAddress({
      sourceKey: "research",
      relativePath: "Notes/Case.MD",
    })).toEqual({
      ok: true,
      value: {
        sourceKey: "research",
        relativePath: "Notes/Case.MD",
      },
    });
  });

  it("rejects empty, absolute, drive, UNC, empty-segment, dot-segment and control paths", () => {
    const invalid = [
      "",
      "/A.md",
      "A.md/",
      "A//B.md",
      "./A.md",
      "A/./B.md",
      "../A.md",
      "A/../B.md",
      "C:/A.md",
      "C:\\A.md",
      "//server/share/A.md",
      "\\\\server\\share\\A.md",
      "A/\u0000B.md",
      "A/\u001fB.md",
    ];

    for (const value of invalid) {
      expect(canonicalKnowledgeRelativePath(value)).toMatchObject({
        ok: false,
        reason: "invalid_path",
      });
    }
  });

  it("requires explicit provider proof before accepting a literal backslash segment", () => {
    const path = String.raw`Notes/literal\name.md`;

    expect(canonicalKnowledgeRelativePath(path)).toEqual({
      ok: false,
      reason: "provider_validation_required",
    });
    expect(canonicalKnowledgeRelativePath(path, {
      literalBackslash: "provider-validated",
    })).toEqual({ ok: true, value: path });
  });
});

describe("Wikilink resolution", () => {
  it("consumes shared lexer fields after structural backslash unescaping", () => {
    const ir = parseMarkdownKnowledgeIr(
      String.raw`[[Projects/A\#1\|draft.md#part\#x|shown]]`,
    );
    const token = ir.tokens.find((candidate) => candidate.kind === "wikilink");
    expect(token).toMatchObject({
      kind: "wikilink",
      address: "Projects/A#1|draft.md",
      fragment: "part#x",
    });
    if (!token || token.kind !== "wikilink") return;

    expect(resolveKnowledgeWikilink(PAGE, token)).toEqual({
      kind: "internal",
      address: {
        sourceKey: "main",
        relativePath: "Projects/A#1|draft.md",
      },
      fragment: "part#x",
    });
  });

  it("resolves canonical paths from the current source root and preserves fragments", () => {
    expect(resolveKnowledgeWikilink(PAGE, {
      address: "Projects/设计.MD",
      fragment: "Heading 1",
    })).toEqual({
      kind: "internal",
      address: {
        sourceKey: "main",
        relativePath: "Projects/设计.MD",
      },
      fragment: "Heading 1",
    });
  });

  it("treats an empty address with a fragment as a current-page link", () => {
    expect(resolveKnowledgeWikilink(PAGE, {
      address: "",
      fragment: "Section",
    })).toEqual({
      kind: "internal",
      address: PAGE,
      fragment: "Section",
    });
  });

  it("does not percent-decode Wikilink addresses", () => {
    expect(resolveKnowledgeWikilink(PAGE, {
      address: "Notes/A%20B.md",
    })).toEqual({
      kind: "internal",
      address: {
        sourceKey: "main",
        relativePath: "Notes/A%20B.md",
      },
      fragment: null,
    });
  });

  it("rejects source prefixes, absolute paths, dot segments and unproved backslashes", () => {
    expect(resolveKnowledgeWikilink(PAGE, {
      address: "research:Notes/A.md",
    })).toEqual({
      kind: "broken",
      reason: "out_of_scope",
    });

    for (const address of [
      "/Notes/A.md",
      "C:/Notes/A.md",
      "//server/share/A.md",
      "../Notes/A.md",
      "Notes/./A.md",
      String.raw`Notes/A\B.md`,
    ]) {
      expect(resolveKnowledgeWikilink(PAGE, { address })).toMatchObject({
        kind: "broken",
      });
    }
  });

  it("accepts a literal backslash only when the provider validates the exact address", () => {
    const address = String.raw`Notes/literal\name.md`;

    expect(resolveKnowledgeWikilink(PAGE, { address }, {
      isProviderValidatedAddress: (candidate) =>
        candidate.sourceKey === "main"
        && candidate.relativePath === address,
    })).toEqual({
      kind: "internal",
      address: { sourceKey: "main", relativePath: address },
      fragment: null,
    });
  });
});

describe("Markdown destination resolution", () => {
  it("consumes CommonMark-unescaped destinations without a second Markdown pass", () => {
    const ir = parseMarkdownKnowledgeIr(String.raw`[open](Sibling\(draft\).md)`);
    const token = ir.tokens.find(
      (candidate) => candidate.kind === "markdown_link",
    );
    expect(token).toMatchObject({
      kind: "markdown_link",
      destination: "Sibling(draft).md",
    });
    if (!token || token.kind !== "markdown_link") return;

    expect(resolveKnowledgeMarkdownDestination(PAGE, token.destination))
      .toMatchObject({
        kind: "internal",
        address: { relativePath: "Notes/Sibling(draft).md" },
      });
  });

  it("resolves page-directory-relative dot segments and root-safe parents", () => {
    expect(resolveKnowledgeMarkdownDestination(
      {
        sourceKey: "research",
        relativePath: "Projects/Current.md",
      },
      "../Shared/Plan.md#Today",
    )).toEqual({
      kind: "internal",
      address: {
        sourceKey: "research",
        relativePath: "Shared/Plan.md",
      },
      fragment: "Today",
    });
    expect(resolveKnowledgeMarkdownDestination(PAGE, "./Sibling.md")).toEqual({
      kind: "internal",
      address: {
        sourceKey: "main",
        relativePath: "Notes/Sibling.md",
      },
      fragment: null,
    });
  });

  it("resolves an empty path plus fragment to the current page", () => {
    expect(resolveKnowledgeMarkdownDestination(PAGE, "#section")).toEqual({
      kind: "internal",
      address: PAGE,
      fragment: "section",
    });
    expect(resolveKnowledgeMarkdownDestination(PAGE, "")).toEqual({
      kind: "broken",
      reason: "invalid_destination",
    });
  });

  it("classifies only HTTP and HTTPS as supported external destinations", () => {
    expect(resolveKnowledgeMarkdownDestination(
      PAGE,
      "https://example.test/a?q=1#x",
    )).toEqual({
      kind: "external",
      url: "https://example.test/a?q=1#x",
    });
    expect(resolveKnowledgeMarkdownDestination(
      PAGE,
      "HTTP://example.test/a",
    )).toEqual({
      kind: "external",
      url: "HTTP://example.test/a",
    });
    for (const destination of [
      "mailto:test@example.test",
      "file:///tmp/a.md",
      "javascript:alert(1)",
      "custom:a.md",
    ]) {
      expect(resolveKnowledgeMarkdownDestination(PAGE, destination)).toEqual({
        kind: "broken",
        reason: "unsupported_scheme",
      });
    }
  });

  it("rejects protocol-relative, rooted, drive, UNC, query and source-prefixed inputs", () => {
    const destinations = [
      "//example.test/A.md",
      "/Notes/A.md",
      String.raw`\Notes\A.md`,
      "C:/Notes/A.md",
      String.raw`C:\Notes\A.md`,
      String.raw`\\server\share\A.md`,
      "A.md?download=1",
      "research:Notes/A.md",
    ];

    for (const destination of destinations) {
      expect(resolveKnowledgeMarkdownDestination(PAGE, destination)).toMatchObject({
        kind: "broken",
      });
    }
  });

  it("percent-decodes each path segment exactly once as strict UTF-8", () => {
    expect(resolveKnowledgeMarkdownDestination(
      PAGE,
      "A%20B/%E8%AE%BE%E8%AE%A1.md",
    )).toEqual({
      kind: "internal",
      address: {
        sourceKey: "main",
        relativePath: "Notes/A B/设计.md",
      },
      fragment: null,
    });
    expect(resolveKnowledgeMarkdownDestination(PAGE, "A%252FB.md")).toEqual({
      kind: "internal",
      address: {
        sourceKey: "main",
        relativePath: "Notes/A%2FB.md",
      },
      fragment: null,
    });
  });

  it("rejects invalid escapes, invalid UTF-8, encoded separators and controls", () => {
    for (const destination of [
      "A%.md",
      "A%2.md",
      "A%GG.md",
      "%C0%AF.md",
      "A%2FB.md",
      "A%5CB.md",
      "A%00B.md",
      "A%1FB.md",
    ]) {
      expect(resolveKnowledgeMarkdownDestination(PAGE, destination)).toEqual({
        kind: "broken",
        reason: "invalid_percent_encoding",
      });
    }
  });

  it("normalizes decoded dot segments but rejects every source escape", () => {
    expect(resolveKnowledgeMarkdownDestination(
      PAGE,
      "%2E/Sibling.md",
    )).toMatchObject({
      kind: "internal",
      address: { relativePath: "Notes/Sibling.md" },
    });
    expect(resolveKnowledgeMarkdownDestination(
      PAGE,
      "%2E%2E/Root.md",
    )).toMatchObject({
      kind: "internal",
      address: { relativePath: "Root.md" },
    });
    for (const destination of [
      "../../Outside.md",
      "%2E%2E/%2E%2E/Outside.md",
      "../../../Outside.md",
    ]) {
      expect(resolveKnowledgeMarkdownDestination(PAGE, destination)).toEqual({
        kind: "broken",
        reason: "out_of_scope",
      });
    }
  });

  it("preserves actual Unicode and case without NFC or case folding", () => {
    const destinations = [
      ["Cafe%CC%81.MD", "Notes/Cafe\u0301.MD"],
      ["Caf%C3%A9.md", "Notes/Café.md"],
      ["CASE.Md", "Notes/CASE.Md"],
    ] as const;

    for (const [destination, relativePath] of destinations) {
      expect(resolveKnowledgeMarkdownDestination(PAGE, destination)).toMatchObject({
        kind: "internal",
        address: { relativePath },
      });
    }
  });
});

describe("same-source link formatting", () => {
  it("formats escaped root-relative Wikilinks without source prefixes", () => {
    expect(formatKnowledgeWikilink(PAGE, {
      sourceKey: "main",
      relativePath: "Projects/A#1|draft[old].md",
    }, "L1C1-L1C2")).toEqual({
      ok: true,
      value: String.raw`Projects/A\#1\|draft\[old\].md#L1C1-L1C2`,
    });
  });

  it("formats page-relative Markdown destinations with RFC 3986 segment encoding", () => {
    expect(formatKnowledgeMarkdownDestination(PAGE, {
      sourceKey: "main",
      relativePath: "Assets/design draft (v1)!.png",
    }, "preview")).toEqual({
      ok: true,
      value: "../Assets/design%20draft%20%28v1%29%21.png#preview",
    });
    expect(formatKnowledgeMarkdownDestination(PAGE, {
      sourceKey: "main",
      relativePath: "Notes/Sibling.md",
    })).toEqual({
      ok: true,
      value: "Sibling.md",
    });
  });

  it("refuses to format cross-source or invalid targets", () => {
    expect(formatKnowledgeWikilink(PAGE, {
      sourceKey: "research",
      relativePath: "A.md",
    })).toEqual({ ok: false, reason: "out_of_scope" });
    expect(formatKnowledgeMarkdownDestination(PAGE, {
      sourceKey: "main",
      relativePath: "../A.md",
    })).toEqual({ ok: false, reason: "invalid_address" });
  });

  it("round-trips generated destinations without cwd or platform path semantics", () => {
    const target = {
      sourceKey: "main",
      relativePath: "Notes/Sub/设计 #1.md",
    } as const;
    const generated = formatKnowledgeMarkdownDestination(PAGE, target, "标题");
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;

    expect(resolveKnowledgeMarkdownDestination(PAGE, generated.value)).toEqual({
      kind: "internal",
      address: target,
      fragment: "标题",
    });
  });
});
