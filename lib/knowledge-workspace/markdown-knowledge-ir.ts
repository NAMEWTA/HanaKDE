import {
  lexMarkdownKnowledge,
  throwIfMarkdownIrAborted,
} from "./markdown-lexer.ts";

export { MarkdownKnowledgeIrAbortError } from "./markdown-lexer.ts";

export interface MarkdownTextRange {
  /** Inclusive UTF-16 code-unit offset. */
  readonly from: number;
  /** Exclusive UTF-16 code-unit offset. */
  readonly to: number;
}

interface MarkdownKnowledgeTokenBase {
  readonly range: MarkdownTextRange;
  readonly raw: string;
}

export interface MarkdownFrontmatterToken extends MarkdownKnowledgeTokenBase {
  readonly kind: "frontmatter";
  readonly closed: true;
  readonly openingRange: MarkdownTextRange;
  readonly contentRange: MarkdownTextRange;
  readonly closingRange: MarkdownTextRange;
}

export interface MarkdownFencedCodeToken extends MarkdownKnowledgeTokenBase {
  readonly kind: "fenced_code";
  readonly marker: "`" | "~";
  readonly markerLength: number;
  readonly info: string;
  readonly openingMarkerRange: MarkdownTextRange;
  readonly contentRange: MarkdownTextRange;
  readonly closingMarkerRange?: MarkdownTextRange;
  readonly closed: boolean;
}

export interface MarkdownIndentedCodeToken extends MarkdownKnowledgeTokenBase {
  readonly kind: "indented_code";
  readonly contentRange: MarkdownTextRange;
}

export interface MarkdownInlineCodeToken extends MarkdownKnowledgeTokenBase {
  readonly kind: "inline_code";
  readonly markerLength: number;
  readonly openingMarkerRange: MarkdownTextRange;
  readonly contentRange: MarkdownTextRange;
  readonly closingMarkerRange: MarkdownTextRange;
  readonly closed: true;
}

export interface MarkdownHeadingToken extends MarkdownKnowledgeTokenBase {
  readonly kind: "heading";
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly style: "atx" | "setext";
  readonly markerRange: MarkdownTextRange;
  readonly textRange: MarkdownTextRange;
  readonly text: string;
}

export interface MarkdownWikilinkToken extends MarkdownKnowledgeTokenBase {
  readonly kind: "wikilink";
  readonly embedded: boolean;
  readonly addressRange: MarkdownTextRange;
  readonly address: string;
  readonly fragmentRange?: MarkdownTextRange;
  readonly fragment?: string;
  readonly displayRange?: MarkdownTextRange;
  readonly display?: string;
}

export interface MarkdownLinkToken extends MarkdownKnowledgeTokenBase {
  readonly kind: "markdown_link";
  readonly embedded: boolean;
  readonly labelRange: MarkdownTextRange;
  readonly label: string;
  readonly destinationRange: MarkdownTextRange;
  readonly destination: string;
  readonly titleRange?: MarkdownTextRange;
  readonly title?: string;
}

export interface MarkdownTagToken extends MarkdownKnowledgeTokenBase {
  readonly kind: "tag";
  readonly bodyRange: MarkdownTextRange;
  /** NFC-normalized body without the leading `#`. */
  readonly tag: string;
}

export interface MarkdownTaskMarkerToken extends MarkdownKnowledgeTokenBase {
  readonly kind: "task_marker";
  readonly markerRange: MarkdownTextRange;
  readonly checked: boolean;
}

export interface MarkdownFootnoteDefinitionToken extends MarkdownKnowledgeTokenBase {
  readonly kind: "footnote_definition";
  readonly labelRange: MarkdownTextRange;
  readonly label: string;
  readonly markerRange: MarkdownTextRange;
  /**
   * Exact source span containing the definition body. Continuation indentation
   * remains present in this range; use `content` for static Markdown rendering.
   */
  readonly contentRange: MarkdownTextRange;
  /** Body normalized to LF with one continuation indent removed. */
  readonly content: string;
  /** True when an earlier exact, case-sensitive label already won. */
  readonly duplicate: boolean;
}

export interface MarkdownFootnoteReferenceToken extends MarkdownKnowledgeTokenBase {
  readonly kind: "footnote_reference";
  readonly labelRange: MarkdownTextRange;
  readonly label: string;
  /** Exact range of the first winning definition in this document. */
  readonly definitionRange?: MarkdownTextRange;
}

export interface MarkdownInlineFootnoteToken extends MarkdownKnowledgeTokenBase {
  readonly kind: "inline_footnote";
  readonly contentRange: MarkdownTextRange;
  readonly content: string;
}

export type MarkdownKnowledgeToken =
  | MarkdownFrontmatterToken
  | MarkdownFencedCodeToken
  | MarkdownIndentedCodeToken
  | MarkdownInlineCodeToken
  | MarkdownHeadingToken
  | MarkdownWikilinkToken
  | MarkdownLinkToken
  | MarkdownTagToken
  | MarkdownTaskMarkerToken
  | MarkdownFootnoteDefinitionToken
  | MarkdownFootnoteReferenceToken
  | MarkdownInlineFootnoteToken;

export interface MarkdownKnowledgeIr {
  readonly version: 1;
  /**
   * Every range is a zero-based, half-open offset into the original JavaScript
   * string. JavaScript strings and CodeMirror 6 both count UTF-16 code units.
   */
  readonly coordinateSystem: "utf16_code_units";
  readonly textLength: number;
  readonly lineEnding: "none" | "lf" | "crlf" | "cr" | "mixed";
  /**
   * Stable by range.from, then containing range before contained range, then
   * kind. Intentional semantic containment is allowed; partial overlap is not.
   */
  readonly tokens: readonly MarkdownKnowledgeToken[];
}

export interface ParseMarkdownKnowledgeIrOptions {
  readonly signal?: AbortSignal;
}

const PERIODIC_ABORT_MASK = 0x1ff;

function lineEndingOf(
  source: string,
  signal?: AbortSignal,
): MarkdownKnowledgeIr["lineEnding"] {
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let index = 0; index < source.length; index += 1) {
    if ((index & PERIODIC_ABORT_MASK) === 0) throwIfMarkdownIrAborted(signal);
    if (source[index] === "\r") {
      if (source[index + 1] === "\n") {
        crlf += 1;
        index += 1;
      } else {
        cr += 1;
      }
    } else if (source[index] === "\n") {
      lf += 1;
    }
  }
  const kinds = Number(crlf > 0) + Number(lf > 0) + Number(cr > 0);
  if (kinds > 1) return "mixed";
  if (crlf > 0) return "crlf";
  if (lf > 0) return "lf";
  if (cr > 0) return "cr";
  return "none";
}

/**
 * Shared Renderer/Server entry point. It is deliberately independent of CM6,
 * DOM, filesystem, source resolution, indexing, and product mutation behavior.
 */
export function parseMarkdownKnowledgeIr(
  source: string,
  options: ParseMarkdownKnowledgeIrOptions = {},
): MarkdownKnowledgeIr {
  throwIfMarkdownIrAborted(options.signal);
  const tokens = lexMarkdownKnowledge(source, options);
  throwIfMarkdownIrAborted(options.signal);

  return {
    version: 1,
    coordinateSystem: "utf16_code_units",
    textLength: source.length,
    lineEnding: lineEndingOf(source, options.signal),
    tokens,
  };
}

/**
 * Process-neutral representation used to prove that independent consumers see
 * precisely the same shared contract. No parser or CM6 objects cross the seam.
 */
export function serializeMarkdownKnowledgeIr(ir: MarkdownKnowledgeIr): string {
  return JSON.stringify(ir);
}
