import { describe, expect, it } from "vitest";
import {
  MarkdownKnowledgeIrAbortError,
  parseMarkdownKnowledgeIr,
  serializeMarkdownKnowledgeIr,
  type MarkdownKnowledgeToken,
  type MarkdownTextRange,
} from "../lib/knowledge-workspace/markdown-knowledge-ir.ts";

function expectRange(
  source: string,
  range: MarkdownTextRange | undefined,
  expected: string,
): void {
  expect(range).toBeDefined();
  expect(range!.from).toBeGreaterThanOrEqual(0);
  expect(range!.to).toBeGreaterThanOrEqual(range!.from);
  expect(range!.to).toBeLessThanOrEqual(source.length);
  expect(source.slice(range!.from, range!.to)).toBe(expected);
}

function expectWellFormedTokens(source: string, tokens: readonly MarkdownKnowledgeToken[]): void {
  for (const token of tokens) {
    expect(token.range.to).toBeGreaterThan(token.range.from);
    expectRange(source, token.range, token.raw);
    for (const [key, value] of Object.entries(token)) {
      if (!key.endsWith("Range") || !value || typeof value !== "object") continue;
      const range = value as MarkdownTextRange;
      expect(
        source[range.to - 1] === "\r" && source[range.to] === "\n",
        `${token.kind}.${key} must not split CRLF`,
      ).toBe(false);
    }
  }
  for (let leftIndex = 0; leftIndex < tokens.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < tokens.length; rightIndex += 1) {
      const left = tokens[leftIndex].range;
      const right = tokens[rightIndex].range;
      if (left.to <= right.from || right.to <= left.from) continue;
      const leftContainsRight = left.from <= right.from && left.to >= right.to;
      const rightContainsLeft = right.from <= left.from && right.to >= left.to;
      expect(leftContainsRight || rightContainsLeft).toBe(true);
    }
  }
}

function tokensOfKind<Kind extends MarkdownKnowledgeToken["kind"]>(
  tokens: readonly MarkdownKnowledgeToken[],
  kind: Kind,
): Extract<MarkdownKnowledgeToken, { kind: Kind }>[] {
  return tokens.filter(
    (token): token is Extract<MarkdownKnowledgeToken, { kind: Kind }> => token.kind === kind,
  );
}

describe("Markdown Knowledge IR", () => {
  it("gives Renderer and Server the same process-neutral UTF-16 contract", () => {
    const source = "# 😀 Overview\r\n[[Notes/设计#结论|显示]] #项目";
    const rendererIr = parseMarkdownKnowledgeIr(source);
    const serverIr = JSON.parse(serializeMarkdownKnowledgeIr(
      parseMarkdownKnowledgeIr(source),
    ));

    expect(serverIr).toEqual(rendererIr);
    expect(rendererIr).toMatchObject({
      version: 1,
      coordinateSystem: "utf16_code_units",
      textLength: source.length,
      lineEnding: "crlf",
    });
    expectWellFormedTokens(source, rendererIr.tokens);
  });

  it("projects exact frontmatter, fence, inline-code, and heading subranges", () => {
    const source = [
      "\ufeff---",
      "title: 😀",
      "---",
      "# Heading #",
      "~~~ts",
      "#hidden",
      "~~~",
      "before ``code",
      "line`` after",
    ].join("\r\n");
    const ir = parseMarkdownKnowledgeIr(source);
    const [frontmatter] = tokensOfKind(ir.tokens, "frontmatter");
    const [heading] = tokensOfKind(ir.tokens, "heading");
    const [fence] = tokensOfKind(ir.tokens, "fenced_code");
    const [inline] = tokensOfKind(ir.tokens, "inline_code");

    expectRange(source, frontmatter.openingRange, "---");
    expectRange(source, frontmatter.contentRange, "title: 😀\r\n");
    expectRange(source, frontmatter.closingRange, "---");
    expectRange(source, heading.markerRange, "#");
    expectRange(source, heading.textRange, "Heading");
    expectRange(source, fence.openingMarkerRange, "~~~");
    expectRange(source, fence.contentRange, "#hidden\r\n");
    expectRange(source, fence.closingMarkerRange, "~~~");
    expect(fence).toMatchObject({ marker: "~", markerLength: 3, info: "ts", closed: true });
    expectRange(source, inline.openingMarkerRange, "``");
    expectRange(source, inline.contentRange, "code\r\nline");
    expectRange(source, inline.closingMarkerRange, "``");
    expect(tokensOfKind(ir.tokens, "tag")).toEqual([]);
    expectWellFormedTokens(source, ir.tokens);
  });

  it("only accepts BOM-prefixed ---...--- frontmatter and treats malformed boundaries as Markdown", () => {
    const dotCloser = "---\ntags: #visible\n...\n#after";
    const unclosed = "---\ntags: #visible";
    const closed = "\ufeff---\rtags: #hidden\r---\r#visible";

    expect(tokensOfKind(parseMarkdownKnowledgeIr(dotCloser).tokens, "frontmatter")).toEqual([]);
    expect(tokensOfKind(parseMarkdownKnowledgeIr(unclosed).tokens, "frontmatter")).toEqual([]);
    expect(tokensOfKind(parseMarkdownKnowledgeIr(dotCloser).tokens, "tag").map(token => token.tag))
      .toEqual(["visible", "after"]);
    expect(tokensOfKind(parseMarkdownKnowledgeIr(unclosed).tokens, "tag"))
      .toEqual([expect.objectContaining({ tag: "visible" })]);

    const closedIr = parseMarkdownKnowledgeIr(closed);
    expect(closedIr.lineEnding).toBe("cr");
    expect(tokensOfKind(closedIr.tokens, "frontmatter")).toHaveLength(1);
    expect(tokensOfKind(closedIr.tokens, "tag"))
      .toEqual([expect.objectContaining({ tag: "visible" })]);
  });

  it("uses Lezer CommonMark/GFM boundaries for nested tasks and every code form", () => {
    const source = [
      "> 1. [X] nested task",
      "",
      "    #indented-hidden",
      "",
      "```js",
      "#fenced-hidden",
      "```",
      "",
      "`#inline-hidden`",
      "",
      "```bad`info",
      "",
      "# visible-heading",
      "",
      "unmatched ` #visible-tag",
    ].join("\n");
    const ir = parseMarkdownKnowledgeIr(source);

    expect(tokensOfKind(ir.tokens, "task_marker")).toEqual([
      expect.objectContaining({ raw: "[X]", checked: true }),
    ]);
    expect(tokensOfKind(ir.tokens, "indented_code")).toHaveLength(1);
    expect(tokensOfKind(ir.tokens, "fenced_code")).toHaveLength(1);
    expect(tokensOfKind(ir.tokens, "inline_code")).toHaveLength(1);
    expect(tokensOfKind(ir.tokens, "heading")).toEqual([
      expect.objectContaining({ text: "visible-heading" }),
    ]);
    expect(tokensOfKind(ir.tokens, "tag")).toEqual([
      expect.objectContaining({ tag: "visible-tag" }),
    ]);
  });

  it("uses Lezer HTML nodes to exclude blocks, comments, attributes, and script/style", () => {
    const source = [
      '<div id="#attr">#body [[block]]</div>',
      "<!-- #comment [[comment]] -->",
      "<script>",
      "#script [[script]]",
      "</script>",
      "<style>#style [[style]]</style>",
      "",
      'text <span title="#attribute">#visible</span> [[shown]]',
    ].join("\n");
    const ir = parseMarkdownKnowledgeIr(source);

    expect(tokensOfKind(ir.tokens, "tag").map(token => token.tag)).toEqual(["visible"]);
    expect(tokensOfKind(ir.tokens, "wikilink").map(token => token.address)).toEqual(["shown"]);
  });

  it("projects parenthesized and multiline Markdown link fields and scans only visible labels", () => {
    const source = [
      "[label #visible](foo(and(bar))",
      " \"multi",
      " title\")",
      "[space](<docs/a b.md>",
      "'A title')",
      "[same]()",
      "[paren]((foo))",
      "<https://example.com/#hidden> https://example.com/#hidden-too",
    ].join("\n");
    const ir = parseMarkdownKnowledgeIr(source);
    const links = tokensOfKind(ir.tokens, "markdown_link");

    expect(links).toHaveLength(4);
    expectRange(source, links[0].labelRange, "label #visible");
    expectRange(source, links[0].destinationRange, "foo(and(bar))");
    expectRange(source, links[0].titleRange, "multi\n title");
    expect(links[0]).toMatchObject({
      label: "label #visible",
      destination: "foo(and(bar))",
      title: "multi\n title",
    });
    expect(links[1]).toMatchObject({ destination: "docs/a b.md", title: "A title" });
    expectRange(source, links[2].destinationRange, "");
    expect(links[2].destination).toBe("");
    expectRange(source, links[3].destinationRange, "(foo)");
    expect(links[3].destination).toBe("(foo)");
    expect(tokensOfKind(ir.tokens, "tag")).toEqual([
      expect.objectContaining({ tag: "visible" }),
    ]);
    expectWellFormedTokens(source, ir.tokens);
  });

  it("projects raw escaped Wikilink fields and lets visible display text contain tags", () => {
    const source = String.raw`\![[plain]] ![[assets/a\|b.png#frag\#x|hero #é]]`;
    const links = tokensOfKind(parseMarkdownKnowledgeIr(source).tokens, "wikilink");

    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ embedded: false, address: "plain" });
    expect(links[0].raw).toBe("[[plain]]");
    expect(links[1]).toMatchObject({
      embedded: true,
      address: "assets/a|b.png",
      fragment: "frag#x",
      display: "hero #é",
    });
    expectRange(source, links[1].addressRange, String.raw`assets/a\|b.png`);
    expectRange(source, links[1].fragmentRange, String.raw`frag\#x`);
    expectRange(source, links[1].displayRange, "hero #é");
    expect(tokensOfKind(parseMarkdownKnowledgeIr(source).tokens, "tag")).toEqual([
      expect.objectContaining({ raw: "#é", tag: "é" }),
    ]);
  });

  it("implements the complete Unicode body-tag boundary contract", () => {
    const source = String.raw`#é #1a #-a #/a .#dot #123 a#no _#no /#no \#no ##no #<no>`;
    const tags = tokensOfKind(parseMarkdownKnowledgeIr(source).tokens, "tag");

    expect(tags.map(tag => ({ raw: tag.raw, tag: tag.tag }))).toEqual([
      { raw: "#é", tag: "é" },
      { raw: "#1a", tag: "1a" },
      { raw: "#-a", tag: "-a" },
      { raw: "#/a", tag: "/a" },
      { raw: "#dot", tag: "dot" },
    ]);
    for (const tag of tags) expectRange(source, tag.bodyRange, tag.raw.slice(1));
  });

  it("keeps stable containment order without permitting partial overlap", () => {
    const source = "# Heading [label #inside](page.md) [[target|show #wiki]]";
    const tokens = parseMarkdownKnowledgeIr(source).tokens;

    expect(tokens.map(token => token.kind)).toEqual([
      "heading",
      "markdown_link",
      "tag",
      "wikilink",
      "tag",
    ]);
    expectWellFormedTokens(source, tokens);
    expect(parseMarkdownKnowledgeIr(source).tokens).toEqual(tokens);
  });

  it("preserves mixed line endings, surrogate offsets, and deterministic repeats", () => {
    const source = "# 😀\r# lone\ud83d\n[[A]]\r\n#tag";
    const first = parseMarkdownKnowledgeIr(source);

    expect(first.lineEnding).toBe("mixed");
    expect(first.textLength).toBe(source.length);
    expect(parseMarkdownKnowledgeIr(source)).toEqual(first);
    expectWellFormedTokens(source, first.tokens);
  });

  it("normalizes block outer ranges without splitting LF, CRLF, lone CR, or mixed endings", () => {
    const source = [
      "# lf\n",
      "# crlf\r\n",
      "# cr\r",
      "    indented\r\n",
      "~~~\r",
      "#hidden\r",
      "~~~\r\n",
      "tail",
    ].join("");
    const ir = parseMarkdownKnowledgeIr(source);

    expect(tokensOfKind(ir.tokens, "heading").map(token => token.raw)).toEqual([
      "# lf",
      "# crlf",
      "# cr",
    ]);
    expect(tokensOfKind(ir.tokens, "indented_code").map(token => token.raw))
      .toEqual(["indented"]);
    expect(tokensOfKind(ir.tokens, "fenced_code").map(token => token.raw))
      .toEqual(["~~~\r#hidden\r~~~"]);
    expectWellFormedTokens(source, ir.tokens);
  });

  it("checks cancellation during Lezer and custom long scans", () => {
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    expect(() => parseMarkdownKnowledgeIr("# A", { signal: alreadyAborted.signal }))
      .toThrow(MarkdownKnowledgeIrAbortError);

    let checks = 0;
    const signal = {
      get aborted() {
        checks += 1;
        return checks > 6;
      },
    } as AbortSignal;
    expect(() => parseMarkdownKnowledgeIr(
      `${"plain ".repeat(2_000)}[[target]]`,
      { signal },
    )).toThrowError(expect.objectContaining({
      name: "AbortError",
      code: "markdown_ir_aborted",
    }));

    let lezerChecks = 0;
    const lezerSignal = {
      get aborted() {
        lezerChecks += 1;
        return lezerChecks > 3;
      },
    } as AbortSignal;
    expect(() => parseMarkdownKnowledgeIr("paragraph\n\n".repeat(4_000), {
      signal: lezerSignal,
    })).toThrow(MarkdownKnowledgeIrAbortError);
  });

  it("keeps abort-check work linear when the corpus doubles", () => {
    const countChecks = (lineCount: number): number => {
      let checks = 0;
      const signal = {
        get aborted() {
          checks += 1;
          return false;
        },
      } as AbortSignal;
      const line = "- [ ] #tag [label #visible](docs/a.md) [[target|#shown]]\n";
      parseMarkdownKnowledgeIr(line.repeat(lineCount), { signal });
      return checks;
    };
    const small = countChecks(400);
    const large = countChecks(800);

    expect(small).toBeGreaterThan(0);
    expect(large).toBeLessThanOrEqual(small * 3 + 32);
  });

  it("does not overflow argument stacks for very large tag, heading, and link streams", () => {
    const tags = parseMarkdownKnowledgeIr("#a\n".repeat(130_000));
    expect(tokensOfKind(tags.tokens, "tag")).toHaveLength(130_000);

    const structured = parseMarkdownKnowledgeIr(
      "# Heading [label](docs/a.md)\n\n".repeat(15_000),
    );
    expect(tokensOfKind(structured.tokens, "heading")).toHaveLength(15_000);
    expect(tokensOfKind(structured.tokens, "markdown_link")).toHaveLength(15_000);
  });

  it.each([
    "sourceLines",
    "parserInputWithOffsetPreservingLineBreaks",
    "escapeParity",
    "lineEndingOf",
  ])("can abort deterministically during the %s linear phase", (phase) => {
    let phaseReached = false;
    const signal = {
      get aborted() {
        const stack = new Error().stack ?? "";
        if (!stack.includes(phase)) return false;
        phaseReached = true;
        return true;
      },
    } as AbortSignal;

    expect(() => parseMarkdownKnowledgeIr(
      `${"plain\r\n".repeat(2_000)}#tag`,
      { signal },
    )).toThrow(MarkdownKnowledgeIrAbortError);
    expect(phaseReached).toBe(true);
  });
});
