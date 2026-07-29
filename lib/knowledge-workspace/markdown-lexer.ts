import type { SyntaxNode, Tree } from "@lezer/common";
import { GFM, parser as markdownParser } from "@lezer/markdown";
import type {
  MarkdownFootnoteDefinitionToken,
  MarkdownFootnoteReferenceToken,
  MarkdownHeadingToken,
  MarkdownInlineFootnoteToken,
  MarkdownKnowledgeToken,
  MarkdownLinkToken,
  MarkdownRawHtmlToken,
  MarkdownTextRange,
  MarkdownWikilinkToken,
  ParseMarkdownKnowledgeIrOptions,
} from "./markdown-knowledge-ir.ts";

interface SourceLine {
  readonly from: number;
  readonly to: number;
  readonly fullTo: number;
  readonly text: string;
}

interface RelevantNodes {
  readonly code: SyntaxNode[];
  readonly headings: SyntaxNode[];
  readonly links: SyntaxNode[];
  readonly tasks: SyntaxNode[];
  readonly urls: SyntaxNode[];
  readonly autolinks: SyntaxNode[];
  readonly html: SyntaxNode[];
}

const sharedMarkdownParser = markdownParser.configure(GFM);
const TAG_BODY_CHARACTER = /^[\p{L}\p{M}\p{N}_/-]$/u;
const TAG_REQUIRED_CHARACTER = /[\p{L}\p{M}_]/u;
const TAG_FORBIDDEN_PREFIX = /^[\p{L}\p{M}\p{N}_/\\#]$/u;
const ESCAPABLE_MARKDOWN_CHARACTER = /^[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-]$/u;
const PERIODIC_ABORT_MASK = 0x1ff;

export class MarkdownKnowledgeIrAbortError extends Error {
  readonly code = "markdown_ir_aborted";

  constructor() {
    super("Markdown Knowledge IR parsing was aborted");
    this.name = "AbortError";
  }
}

export function throwIfMarkdownIrAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new MarkdownKnowledgeIrAbortError();
}

function sourceLines(source: string, signal?: AbortSignal): SourceLine[] {
  const lines: SourceLine[] = [];
  let from = 0;
  let work = 0;
  while (from < source.length) {
    if ((lines.length & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    let to = from;
    while (to < source.length && source[to] !== "\n" && source[to] !== "\r") {
      if ((work & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
      work += 1;
      to += 1;
    }
    let fullTo = to;
    if (source[fullTo] === "\r" && source[fullTo + 1] === "\n") fullTo += 2;
    else if (source[fullTo] === "\r" || source[fullTo] === "\n") fullTo += 1;
    lines.push({ from, to, fullTo, text: source.slice(from, to) });
    from = fullTo;
  }
  if (source.length === 0) lines.push({ from: 0, to: 0, fullTo: 0, text: "" });
  return lines;
}

function parserInputWithOffsetPreservingLineBreaks(
  source: string,
  signal?: AbortSignal,
): string {
  const chunks: string[] = [];
  let unchangedFrom = 0;
  for (let index = 0; index < source.length; index += 1) {
    if ((index & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    if (source[index] !== "\r") continue;
    chunks.push(source.slice(unchangedFrom, index));
    if (source[index + 1] === "\n") {
      chunks.push(" \n");
      index += 1;
    } else {
      chunks.push("\n");
    }
    unchangedFrom = index + 1;
  }
  chunks.push(source.slice(unchangedFrom));
  return chunks.join("");
}

function parseMarkdownTree(source: string, signal?: AbortSignal): Tree {
  const partial = sharedMarkdownParser.startParse(
    parserInputWithOffsetPreservingLineBreaks(source, signal),
  );
  let tree: Tree | null = null;
  do {
    throwIfMarkdownIrAborted(signal);
    tree = partial.advance();
  } while (tree === null);
  return tree;
}

function collectRelevantNodes(tree: Tree, signal?: AbortSignal): RelevantNodes {
  const code: SyntaxNode[] = [];
  const headings: SyntaxNode[] = [];
  const links: SyntaxNode[] = [];
  const tasks: SyntaxNode[] = [];
  const urls: SyntaxNode[] = [];
  const autolinks: SyntaxNode[] = [];
  const html: SyntaxNode[] = [];
  const cursor = tree.cursor();
  let visited = 0;

  do {
    if ((visited & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    visited += 1;
    const node = cursor.node;
    if (node.name === "FencedCode" || node.name === "CodeBlock" || node.name === "InlineCode") {
      code.push(node);
    } else if (/^(?:ATXHeading[1-6]|SetextHeading[12])$/u.test(node.name)) {
      headings.push(node);
    } else if (node.name === "Link" || node.name === "Image") {
      links.push(node);
    } else if (node.name === "TaskMarker") {
      tasks.push(node);
    } else if (node.name === "URL") {
      urls.push(node);
    } else if (node.name === "Autolink") {
      autolinks.push(node);
    } else if (node.name === "HTMLBlock"
      || node.name === "CommentBlock"
      || node.name === "HTMLTag") {
      html.push(node);
    }
  } while (cursor.next());

  return {
    code, headings, links, tasks, urls, autolinks, html,
  };
}

function childNodes(
  node: SyntaxNode,
  name?: string,
  signal?: AbortSignal,
): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  let index = 0;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if ((index & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    index += 1;
    if (name === undefined || child.name === name) children.push(child);
  }
  return children;
}

function markdownUnescape(value: string, signal?: AbortSignal): string {
  const chunks: string[] = [];
  let unchangedFrom = 0;
  for (let index = 0; index < value.length; index += 1) {
    if ((index & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    if (value[index] !== "\\"
      || index + 1 >= value.length
      || !ESCAPABLE_MARKDOWN_CHARACTER.test(value[index + 1])) continue;
    chunks.push(value.slice(unchangedFrom, index));
    chunks.push(value[index + 1]);
    index += 1;
    unchangedFrom = index + 1;
  }
  chunks.push(value.slice(unchangedFrom));
  return chunks.join("");
}

function trimRange(
  source: string,
  from: number,
  to: number,
  signal?: AbortSignal,
): MarkdownTextRange {
  let work = 0;
  while (from < to && /\s/u.test(source[from])) {
    if ((work & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    work += 1;
    from += 1;
  }
  while (to > from && /\s/u.test(source[to - 1])) {
    if ((work & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    work += 1;
    to -= 1;
  }
  return { from, to };
}

function frontmatterToken(
  source: string,
  lines: readonly SourceLine[],
  signal?: AbortSignal,
): MarkdownKnowledgeToken | null {
  const bomLength = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const first = lines[0];
  if (!first || source.slice(bomLength, first.to) !== "---") return null;

  for (let index = 1; index < lines.length; index += 1) {
    if ((index & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    if (lines[index].text !== "---") continue;
    const closing = lines[index];
    const range = { from: 0, to: closing.to };
    return {
      kind: "frontmatter",
      range,
      raw: source.slice(range.from, range.to),
      closed: true,
      openingRange: { from: bomLength, to: bomLength + 3 },
      contentRange: { from: first.fullTo, to: closing.from },
      closingRange: { from: closing.from, to: closing.to },
    };
  }
  return null;
}

function lineContaining(lines: readonly SourceLine[], offset: number): SourceLine {
  let low = 0;
  let high = lines.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (lines[middle].fullTo <= offset) low = middle + 1;
    else high = middle;
  }
  return lines[low];
}

function normalizedBlockRange(
  lines: readonly SourceLine[],
  node: SyntaxNode,
): MarkdownTextRange {
  if (node.to <= node.from) return { from: node.from, to: node.to };
  const lastLine = lineContaining(lines, node.to - 1);
  const to = node.to > lastLine.to && node.to <= lastLine.fullTo
    ? lastLine.to
    : node.to;
  return { from: node.from, to };
}

function codeToken(
  source: string,
  lines: readonly SourceLine[],
  node: SyntaxNode,
  signal?: AbortSignal,
): MarkdownKnowledgeToken {
  const range = node.name === "InlineCode"
    ? { from: node.from, to: node.to }
    : normalizedBlockRange(lines, node);
  if (node.name === "CodeBlock") {
    return {
      kind: "indented_code",
      range,
      raw: source.slice(range.from, range.to),
      contentRange: range,
    };
  }

  const marks = childNodes(node, "CodeMark", signal);
  if (node.name === "InlineCode") {
    const opening = marks[0];
    const closing = marks[marks.length - 1];
    return {
      kind: "inline_code",
      range,
      raw: source.slice(range.from, range.to),
      markerLength: opening.to - opening.from,
      openingMarkerRange: { from: opening.from, to: opening.to },
      contentRange: { from: opening.to, to: closing.from },
      closingMarkerRange: { from: closing.from, to: closing.to },
      closed: true,
    };
  }

  const opening = marks[0];
  const closing = marks.length > 1 ? marks[marks.length - 1] : undefined;
  const openingLine = lineContaining(lines, opening.from);
  const contentTo = closing ? lineContaining(lines, closing.from).from : range.to;
  const marker = source[opening.from] as "`" | "~";
  return {
    kind: "fenced_code",
    range,
    raw: source.slice(range.from, range.to),
    marker,
    markerLength: opening.to - opening.from,
    info: source.slice(opening.to, openingLine.to).trim(),
    openingMarkerRange: { from: opening.from, to: opening.to },
    contentRange: { from: openingLine.fullTo, to: contentTo },
    ...(closing
      ? { closingMarkerRange: { from: closing.from, to: closing.to } }
      : {}),
    closed: closing !== undefined,
  };
}

function headingToken(
  source: string,
  lines: readonly SourceLine[],
  node: SyntaxNode,
  signal?: AbortSignal,
): MarkdownHeadingToken {
  const marks = childNodes(node, "HeaderMark", signal);
  const marker = marks[0];
  const atx = node.name.startsWith("ATX");
  const level = Number(node.name.at(-1)) as 1 | 2 | 3 | 4 | 5 | 6;
  const trailingMarker = atx && marks.length > 1 ? marks[marks.length - 1] : undefined;
  const textRange = atx
    ? trimRange(source, marker.to, trailingMarker?.from ?? node.to, signal)
    : trimRange(source, node.from, marker.from, signal);
  const range = normalizedBlockRange(lines, node);
  return {
    kind: "heading",
    range,
    raw: source.slice(range.from, range.to),
    level,
    style: atx ? "atx" : "setext",
    markerRange: { from: marker.from, to: marker.to },
    textRange,
    text: source.slice(textRange.from, textRange.to),
  };
}

function markdownDestinationRange(
  source: string,
  from: number,
  to: number,
): MarkdownTextRange {
  const first = source[from];
  const last = source[to - 1];
  if (first === "<" && last === ">") {
    return { from: from + 1, to: to - 1 };
  }
  return { from, to };
}

function markdownTitleRange(source: string, from: number, to: number): MarkdownTextRange {
  const first = source[from];
  const last = source[to - 1];
  if ((first === "\"" && last === "\"")
    || (first === "'" && last === "'")
    || (first === "(" && last === ")")) {
    return { from: from + 1, to: to - 1 };
  }
  return { from, to };
}

function linkToken(
  source: string,
  node: SyntaxNode,
  signal?: AbortSignal,
): MarkdownLinkToken | null {
  const marks = childNodes(node, "LinkMark", signal);
  const url = childNodes(node, "URL", signal)[0];
  if (marks.length < 4) return null;
  const labelRange = { from: marks[0].to, to: marks[1].from };
  const destinationRange = url
    ? markdownDestinationRange(source, url.from, url.to)
    : { from: marks[2].to, to: marks[marks.length - 1].from };
  const titleNode = childNodes(node, "LinkTitle", signal)[0];
  const titleRange = titleNode
    ? markdownTitleRange(source, titleNode.from, titleNode.to)
    : undefined;
  return {
    kind: "markdown_link",
    range: { from: node.from, to: node.to },
    raw: source.slice(node.from, node.to),
    embedded: node.name === "Image",
    labelRange,
    label: markdownUnescape(source.slice(labelRange.from, labelRange.to), signal),
    destinationRange,
    destination: markdownUnescape(
      source.slice(destinationRange.from, destinationRange.to),
      signal,
    ),
    ...(titleRange
      ? {
          titleRange,
          title: markdownUnescape(source.slice(titleRange.from, titleRange.to), signal),
        }
      : {}),
  };
}

function mergeIntervalStreams(
  streams: readonly (readonly MarkdownTextRange[])[],
  signal?: AbortSignal,
): MarkdownTextRange[] {
  const indices = new Uint32Array(streams.length);
  const normalized: MarkdownTextRange[] = [];
  let work = 0;
  for (;;) {
    if ((work & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    work += 1;
    let selectedStream = -1;
    let interval: MarkdownTextRange | undefined;
    for (let stream = 0; stream < streams.length; stream += 1) {
      const candidate = streams[stream][indices[stream]];
      if (!candidate) continue;
      if (!interval
        || candidate.from < interval.from
        || (candidate.from === interval.from && candidate.to < interval.to)) {
        interval = candidate;
        selectedStream = stream;
      }
    }
    if (!interval || selectedStream < 0) return normalized;
    indices[selectedStream] += 1;
    if (interval.to <= interval.from) continue;
    const previous = normalized[normalized.length - 1];
    if (!previous || interval.from > previous.to) {
      normalized.push({ from: interval.from, to: interval.to });
    } else if (interval.to > previous.to) {
      normalized[normalized.length - 1] = { from: previous.from, to: interval.to };
    }
  }
}

function escapeParity(source: string, signal?: AbortSignal): Uint8Array {
  const escaped = new Uint8Array(source.length);
  let slashRun = 0;
  for (let index = 0; index < source.length; index += 1) {
    if ((index & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    escaped[index] = slashRun % 2;
    slashRun = source[index] === "\\" ? slashRun + 1 : 0;
  }
  return escaped;
}

function nextCodePoint(source: string, offset: number): { value: string; width: number } {
  const point = source.codePointAt(offset);
  if (point === undefined) return { value: "", width: 0 };
  const value = String.fromCodePoint(point);
  return { value, width: value.length };
}

function previousCodePoint(source: string, offset: number): string {
  if (offset <= 0) return "";
  const tail = source.charCodeAt(offset - 1);
  if (tail >= 0xdc00 && tail <= 0xdfff && offset >= 2) {
    const lead = source.charCodeAt(offset - 2);
    if (lead >= 0xd800 && lead <= 0xdbff) return source.slice(offset - 2, offset);
  }
  return source[offset - 1];
}

function advanceExclusion(
  exclusions: readonly MarkdownTextRange[],
  cursor: number,
  offset: number,
  signal?: AbortSignal,
): number {
  let work = 0;
  while (exclusions[cursor]?.to <= offset) {
    if ((work & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    work += 1;
    cursor += 1;
  }
  return cursor;
}

function definitionContinuationContent(line: SourceLine): string | null {
  if (line.text.startsWith("\t")) return line.text.slice(1);
  if (line.text.startsWith("    ")) return line.text.slice(4);
  return null;
}

function collectFootnoteDefinitions(
  source: string,
  lines: readonly SourceLine[],
  exclusions: readonly MarkdownTextRange[],
  signal?: AbortSignal,
): MarkdownFootnoteDefinitionToken[] {
  const tokens: MarkdownFootnoteDefinitionToken[] = [];
  const firstByLabel = new Map<string, MarkdownFootnoteDefinitionToken>();
  let exclusionCursor = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if ((lineIndex & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    const line = lines[lineIndex];
    exclusionCursor = advanceExclusion(exclusions, exclusionCursor, line.from, signal);
    const exclusion = exclusions[exclusionCursor];
    if (exclusion && exclusion.from <= line.from && line.from < exclusion.to) continue;

    const match = /^\[\^([^\]\s]+)\]:([ \t]?)(.*)$/u.exec(line.text);
    if (!match) continue;

    const label = match[1];
    const markerLength = label.length + 4;
    const firstContentFrom = line.from + markerLength + match[2].length;
    const contentLines = [match[3]];
    let rangeTo = line.to;
    let contentTo = line.to;
    let nextLineIndex = lineIndex + 1;
    let pendingBlankLines = 0;

    for (; nextLineIndex < lines.length; nextLineIndex += 1) {
      if ((nextLineIndex & PERIODIC_ABORT_MASK) === 0) {
        throwIfMarkdownIrAborted(signal);
      }
      const continuationLine = lines[nextLineIndex];
      const continuation = definitionContinuationContent(continuationLine);
      if (continuation !== null) {
        while (pendingBlankLines > 0) {
          contentLines.push("");
          pendingBlankLines -= 1;
        }
        contentLines.push(continuation);
        rangeTo = continuationLine.to;
        contentTo = continuationLine.to;
        continue;
      }
      if (continuationLine.text.length === 0) {
        pendingBlankLines += 1;
        continue;
      }
      break;
    }

    const labelRange = {
      from: line.from + 2,
      to: line.from + 2 + label.length,
    };
    const token: MarkdownFootnoteDefinitionToken = {
      kind: "footnote_definition",
      range: { from: line.from, to: rangeTo },
      raw: source.slice(line.from, rangeTo),
      labelRange,
      label,
      markerRange: { from: line.from, to: line.from + markerLength },
      contentRange: { from: firstContentFrom, to: contentTo },
      content: contentLines.join("\n"),
      duplicate: firstByLabel.has(label),
    };
    tokens.push(token);
    if (!token.duplicate) firstByLabel.set(label, token);
    lineIndex = Math.max(lineIndex, nextLineIndex - pendingBlankLines - 1);
  }
  return tokens;
}

function collectInlineFootnotes(
  source: string,
  escaped: Uint8Array,
  exclusions: readonly MarkdownTextRange[],
  definitions: readonly MarkdownFootnoteDefinitionToken[],
  signal?: AbortSignal,
): Array<MarkdownFootnoteReferenceToken | MarkdownInlineFootnoteToken> {
  const tokens: Array<MarkdownFootnoteReferenceToken | MarkdownInlineFootnoteToken> = [];
  const firstDefinitions = new Map<string, MarkdownFootnoteDefinitionToken>();
  for (const definition of definitions) {
    if (!definition.duplicate) firstDefinitions.set(definition.label, definition);
  }

  let exclusionCursor = 0;
  let offset = 0;
  let work = 0;
  while (offset < source.length) {
    if ((work & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    work += 1;
    exclusionCursor = advanceExclusion(exclusions, exclusionCursor, offset, signal);
    const exclusion = exclusions[exclusionCursor];
    if (exclusion && exclusion.from <= offset) {
      offset = exclusion.to;
      continue;
    }

    const isReference = source[offset] === "["
      && source[offset + 1] === "^"
      && !escaped[offset];
    const isInline = source[offset] === "^"
      && source[offset + 1] === "["
      && !escaped[offset];
    if (!isReference && !isInline) {
      offset += 1;
      continue;
    }

    const contentFrom = offset + 2;
    let closing = contentFrom;
    while (closing < source.length
      && source[closing] !== "\n"
      && source[closing] !== "\r"
      && (source[closing] !== "]" || escaped[closing])) {
      if ((work & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
      work += 1;
      closing += 1;
    }
    if (closing >= source.length || source[closing] !== "]") {
      offset += 2;
      continue;
    }

    const content = source.slice(contentFrom, closing);
    if (!content || (isReference && /\s/u.test(content))) {
      offset = closing + 1;
      continue;
    }
    const range = { from: offset, to: closing + 1 };
    if (isReference) {
      const definition = firstDefinitions.get(content);
      tokens.push({
        kind: "footnote_reference",
        range,
        raw: source.slice(range.from, range.to),
        labelRange: { from: contentFrom, to: closing },
        label: content,
        ...(definition ? { definitionRange: definition.range } : {}),
      });
    } else {
      tokens.push({
        kind: "inline_footnote",
        range,
        raw: source.slice(range.from, range.to),
        contentRange: { from: contentFrom, to: closing },
        content,
      });
    }
    offset = closing + 1;
  }
  return tokens;
}

function splitWikilink(
  source: string,
  escaped: Uint8Array,
  from: number,
  bodyFrom: number,
  bodyTo: number,
  embedded: boolean,
  signal?: AbortSignal,
): MarkdownWikilinkToken | null {
  let hash = -1;
  let pipe = -1;
  for (let index = bodyFrom; index < bodyTo; index += 1) {
    if (((index - bodyFrom) & PERIODIC_ABORT_MASK) === 0) {
      throwIfMarkdownIrAborted(signal);
    }
    if (escaped[index]) continue;
    if (source[index] === "|" && pipe < 0) {
      pipe = index;
      break;
    }
    if (source[index] === "#" && hash < 0) hash = index;
  }
  const targetTo = pipe < 0 ? bodyTo : pipe;
  if (hash >= targetTo) hash = -1;
  const addressRange = { from: bodyFrom, to: hash < 0 ? targetTo : hash };
  const fragmentRange = hash < 0 ? undefined : { from: hash + 1, to: targetTo };
  const displayRange = pipe < 0 ? undefined : { from: pipe + 1, to: bodyTo };
  if (addressRange.from === addressRange.to
    && (!fragmentRange || fragmentRange.from === fragmentRange.to)) return null;
  const range = { from, to: bodyTo + 2 };
  return {
    kind: "wikilink",
    range,
    raw: source.slice(range.from, range.to),
    embedded,
    addressRange,
    address: markdownUnescape(
      source.slice(addressRange.from, addressRange.to),
      signal,
    ),
    ...(fragmentRange
      ? {
          fragmentRange,
          fragment: markdownUnescape(
            source.slice(fragmentRange.from, fragmentRange.to),
            signal,
          ),
        }
      : {}),
    ...(displayRange
      ? {
          displayRange,
          display: markdownUnescape(
            source.slice(displayRange.from, displayRange.to),
            signal,
          ),
        }
      : {}),
  };
}

function collectWikilinks(
  source: string,
  lines: readonly SourceLine[],
  escaped: Uint8Array,
  baseExclusions: readonly MarkdownTextRange[],
  signal?: AbortSignal,
): {
  readonly tokens: MarkdownWikilinkToken[];
  readonly tagExclusions: MarkdownTextRange[];
} {
  const tokens: MarkdownWikilinkToken[] = [];
  const tagExclusions: MarkdownTextRange[] = [];
  let exclusionCursor = 0;
  let work = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if ((lineIndex & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    const line = lines[lineIndex];
    let offset = line.from;
    while (offset < line.to) {
      if ((work & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
      work += 1;
      exclusionCursor = advanceExclusion(
        baseExclusions,
        exclusionCursor,
        offset,
        signal,
      );
      const exclusion = baseExclusions[exclusionCursor];
      if (exclusion && exclusion.from <= offset) {
        offset = exclusion.to;
        continue;
      }

      const embedded = source[offset] === "!"
        && !escaped[offset]
        && source[offset + 1] === "["
        && source[offset + 2] === "[";
      const opener = embedded ? offset + 1 : offset;
      if (source[opener] !== "["
        || source[opener + 1] !== "["
        || escaped[opener]) {
        offset += 1;
        continue;
      }

      let closing = opener + 2;
      for (; closing + 1 < line.to; closing += 1) {
        if ((work & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
        work += 1;
        if (source[closing] === "]" && source[closing + 1] === "]" && !escaped[closing]) break;
      }
      if (closing + 1 >= line.to) {
        offset = line.to;
        continue;
      }
      const token = splitWikilink(
        source,
        escaped,
        embedded ? offset : opener,
        opener + 2,
        closing,
        embedded,
        signal,
      );
      if (!token) {
        offset = closing + 2;
        continue;
      }
      tokens.push(token);
      if (token.displayRange) {
        tagExclusions.push(
          { from: token.range.from, to: token.displayRange.from },
          { from: token.displayRange.to, to: token.range.to },
        );
      } else {
        tagExclusions.push(token.range);
      }
      offset = token.range.to;
    }
  }
  return { tokens, tagExclusions };
}

function collectTags(
  source: string,
  escaped: Uint8Array,
  exclusions: readonly MarkdownTextRange[],
  signal?: AbortSignal,
): MarkdownKnowledgeToken[] {
  const tokens: MarkdownKnowledgeToken[] = [];
  let exclusionCursor = 0;
  let offset = 0;
  let work = 0;

  while (offset < source.length) {
    if ((work & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    work += 1;
    exclusionCursor = advanceExclusion(exclusions, exclusionCursor, offset, signal);
    const exclusion = exclusions[exclusionCursor];
    if (exclusion && exclusion.from <= offset) {
      offset = exclusion.to;
      continue;
    }
    if (source[offset] !== "#" || escaped[offset]) {
      offset += 1;
      continue;
    }
    const prefix = previousCodePoint(source, offset);
    if (prefix !== "" && TAG_FORBIDDEN_PREFIX.test(prefix)) {
      offset += 1;
      continue;
    }

    const bodyFrom = offset + 1;
    let bodyTo = bodyFrom;
    let hasRequiredCharacter = false;
    while (bodyTo < source.length) {
      if ((work & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
      work += 1;
      const point = nextCodePoint(source, bodyTo);
      if (point.width === 0 || !TAG_BODY_CHARACTER.test(point.value)) break;
      if (TAG_REQUIRED_CHARACTER.test(point.value)) hasRequiredCharacter = true;
      bodyTo += point.width;
    }
    if (!hasRequiredCharacter) {
      offset = Math.max(bodyTo, offset + 1);
      continue;
    }
    const range = { from: offset, to: bodyTo };
    const bodyRange = { from: bodyFrom, to: bodyTo };
    tokens.push({
      kind: "tag",
      range,
      raw: source.slice(range.from, range.to),
      bodyRange,
      tag: source.slice(bodyRange.from, bodyRange.to).normalize("NFC"),
    });
    offset = bodyTo;
  }
  return tokens;
}

function linkTagExclusions(token: MarkdownLinkToken): MarkdownTextRange[] {
  return [
    { from: token.range.from, to: token.labelRange.from },
    { from: token.labelRange.to, to: token.range.to },
  ];
}

function tokenRangeStream(
  tokens: readonly MarkdownKnowledgeToken[],
  signal?: AbortSignal,
): MarkdownTextRange[] {
  const ranges: MarkdownTextRange[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if ((index & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    ranges.push(tokens[index].range);
  }
  return ranges;
}

function nodeRangeStream(
  nodes: readonly SyntaxNode[],
  lines: readonly SourceLine[],
  signal?: AbortSignal,
): MarkdownTextRange[] {
  const ranges: MarkdownTextRange[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    if ((index & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    const node = nodes[index];
    ranges.push(node.name === "HTMLBlock" || node.name === "CommentBlock"
      ? normalizedBlockRange(lines, node)
      : { from: node.from, to: node.to });
  }
  return ranges;
}

function htmlToken(
  source: string,
  lines: readonly SourceLine[],
  node: SyntaxNode,
): MarkdownRawHtmlToken {
  const range = node.name === "HTMLBlock" || node.name === "CommentBlock"
    ? normalizedBlockRange(lines, node)
    : { from: node.from, to: node.to };
  return {
    kind: "raw_html",
    range,
    raw: source.slice(range.from, range.to),
    syntax: node.name === "CommentBlock"
      ? "comment"
      : node.name === "HTMLBlock"
        ? "block"
        : "inline",
  };
}

function compareTokens(
  left: MarkdownKnowledgeToken,
  right: MarkdownKnowledgeToken,
): number {
  return (
    left.range.from - right.range.from
    || right.range.to - left.range.to
    || left.kind.localeCompare(right.kind)
  );
}

function mergeTokenStreams(
  streams: readonly (readonly MarkdownKnowledgeToken[])[],
  signal?: AbortSignal,
): MarkdownKnowledgeToken[] {
  const indices = new Uint32Array(streams.length);
  const tokens: MarkdownKnowledgeToken[] = [];
  let work = 0;
  for (;;) {
    if ((work & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    work += 1;
    let selectedStream = -1;
    let selected: MarkdownKnowledgeToken | undefined;
    for (let stream = 0; stream < streams.length; stream += 1) {
      const candidate = streams[stream][indices[stream]];
      if (!candidate) continue;
      if (!selected || compareTokens(candidate, selected) < 0) {
        selected = candidate;
        selectedStream = stream;
      }
    }
    if (!selected || selectedStream < 0) return tokens;
    indices[selectedStream] += 1;
    tokens.push(selected);
  }
}

function assertNoPartialOverlap(
  tokens: readonly MarkdownKnowledgeToken[],
  signal?: AbortSignal,
): void {
  const containing: MarkdownKnowledgeToken[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if ((index & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    const token = tokens[index];
    while (containing.length > 0
      && containing[containing.length - 1].range.to <= token.range.from) {
      containing.pop();
    }
    const parent = containing[containing.length - 1];
    if (parent && token.range.to > parent.range.to) {
      throw new Error("Markdown Knowledge IR produced a partial token overlap");
    }
    containing.push(token);
  }
}

/**
 * Shared bounded syntax projection. Lezer supplies CommonMark/GFM structure,
 * while the two product-specific lexical passes add wikilinks and body tags.
 * The returned IR never contains the Lezer tree itself.
 */
export function lexMarkdownKnowledge(
  source: string,
  options: ParseMarkdownKnowledgeIrOptions = {},
): readonly MarkdownKnowledgeToken[] {
  const signal = options.signal;
  const lines = sourceLines(source, signal);
  const tree = parseMarkdownTree(source, options.signal);
  const nodes = collectRelevantNodes(tree, signal);
  const frontmatter = frontmatterToken(source, lines, signal);
  const outsideFrontmatter = (node: SyntaxNode): boolean => !frontmatter
    || node.to <= frontmatter.range.from
    || node.from >= frontmatter.range.to;

  const codeTokens: MarkdownKnowledgeToken[] = [];
  for (let index = 0; index < nodes.code.length; index += 1) {
    if ((index & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    const node = nodes.code[index];
    if (outsideFrontmatter(node)) {
      codeTokens.push(codeToken(source, lines, node, signal));
    }
  }
  const headingTokens: MarkdownHeadingToken[] = [];
  for (let index = 0; index < nodes.headings.length; index += 1) {
    if ((index & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    const node = nodes.headings[index];
    if (outsideFrontmatter(node)) {
      headingTokens.push(headingToken(source, lines, node, signal));
    }
  }
  const linkTokens: MarkdownLinkToken[] = [];
  for (let index = 0; index < nodes.links.length; index += 1) {
    if ((index & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    const node = nodes.links[index];
    if (!outsideFrontmatter(node)) continue;
    const token = linkToken(source, node, signal);
    if (token) linkTokens.push(token);
  }
  const taskTokens: MarkdownKnowledgeToken[] = [];
  for (let index = 0; index < nodes.tasks.length; index += 1) {
    if ((index & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    const node = nodes.tasks[index];
    if (!outsideFrontmatter(node)) continue;
    taskTokens.push({
      kind: "task_marker",
      range: { from: node.from, to: node.to },
      raw: source.slice(node.from, node.to),
      markerRange: { from: node.from, to: node.to },
      checked: source[node.from + 1]?.toLowerCase() === "x",
    });
  }
  const htmlTokens: MarkdownRawHtmlToken[] = [];
  for (let index = 0; index < nodes.html.length; index += 1) {
    if ((index & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    const node = nodes.html[index];
    if (outsideFrontmatter(node)) {
      htmlTokens.push(htmlToken(source, lines, node));
    }
  }

  const frontmatterRanges = frontmatter ? [frontmatter.range] : [];
  const codeRanges = tokenRangeStream(codeTokens, signal);
  const autolinkRanges = nodeRangeStream(nodes.autolinks, lines, signal);
  const urlRanges = nodeRangeStream(nodes.urls, lines, signal);
  const htmlRanges = nodeRangeStream(nodes.html, lines, signal);
  const linkRanges = tokenRangeStream(linkTokens, signal);
  const footnoteDefinitionExclusions = mergeIntervalStreams([
    frontmatterRanges,
    codeRanges,
    htmlRanges,
  ], signal);
  const footnoteDefinitions = collectFootnoteDefinitions(
    source,
    lines,
    footnoteDefinitionExclusions,
    signal,
  );
  const structuralExclusions = mergeIntervalStreams([
    frontmatterRanges,
    codeRanges,
    autolinkRanges,
    urlRanges,
    htmlRanges,
    linkRanges,
  ], signal);
  const escaped = escapeParity(source, signal);
  const footnoteInlineExclusions = mergeIntervalStreams([
    structuralExclusions,
    tokenRangeStream(footnoteDefinitions, signal),
  ], signal);
  const footnoteInlineTokens = collectInlineFootnotes(
    source,
    escaped,
    footnoteInlineExclusions,
    footnoteDefinitions,
    signal,
  );
  const wikilinks = collectWikilinks(
    source,
    lines,
    escaped,
    structuralExclusions,
    signal,
  );

  const linkSyntaxRanges: MarkdownTextRange[] = [];
  for (let index = 0; index < linkTokens.length; index += 1) {
    if ((index & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    const pair = linkTagExclusions(linkTokens[index]);
    linkSyntaxRanges.push(pair[0]);
    linkSyntaxRanges.push(pair[1]);
  }
  const headingMarkerRanges: MarkdownTextRange[] = [];
  for (let index = 0; index < headingTokens.length; index += 1) {
    if ((index & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    headingMarkerRanges.push(headingTokens[index].markerRange);
  }
  const tagExclusions = mergeIntervalStreams([
    frontmatterRanges,
    codeRanges,
    autolinkRanges,
    urlRanges,
    htmlRanges,
    linkSyntaxRanges,
    headingMarkerRanges,
    wikilinks.tagExclusions,
  ], signal);
  const tagTokens = collectTags(source, escaped, tagExclusions, signal);
  const tokens = mergeTokenStreams([
    frontmatter ? [frontmatter] : [],
    codeTokens,
    htmlTokens,
    headingTokens,
    linkTokens,
    taskTokens,
    footnoteDefinitions,
    footnoteInlineTokens,
    wikilinks.tokens,
    tagTokens,
  ], signal);
  assertNoPartialOverlap(tokens, signal);
  throwIfMarkdownIrAborted(signal);
  return tokens;
}
