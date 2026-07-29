import yaml from 'js-yaml';
import {
  parseMarkdownKnowledgeIr,
  type MarkdownFrontmatterToken,
  type MarkdownTextRange,
} from './markdown-knowledge-ir.ts';

export type FrontmatterJsonScalar = string | number | boolean | null;
export type FrontmatterEditableValue =
  | FrontmatterJsonScalar
  | readonly FrontmatterJsonScalar[];

export type FrontmatterSourceModeReason =
  | 'absent'
  | 'invalid_yaml'
  | 'directive_or_multiple_documents'
  | 'duplicate_key'
  | 'merge_key'
  | 'custom_tag'
  | 'anchor_or_alias'
  | 'nested_structure'
  | 'block_scalar'
  | 'unsupported_key'
  | 'unsupported_value'
  | 'uncertain_range';

export interface FrontmatterProjectedField {
  key: string;
  value: FrontmatterEditableValue;
  lineRange: MarkdownTextRange;
  keyRange: MarkdownTextRange;
  valueRange: MarkdownTextRange;
}

export type FrontmatterProjection =
  | Readonly<{
      mode: 'properties';
      range: MarkdownTextRange;
      contentRange: MarkdownTextRange;
      closingRange: MarkdownTextRange;
      fields: readonly FrontmatterProjectedField[];
    }>
  | Readonly<{
      mode: 'source';
      reason: FrontmatterSourceModeReason;
      range: MarkdownTextRange | null;
    }>;

export type FrontmatterPatch =
  | Readonly<{
      ok: true;
      from: number;
      to: number;
      insert: string;
    }>
  | Readonly<{
      ok: false;
      reason: FrontmatterSourceModeReason | 'invalid_key' | 'invalid_value' | 'missing_key';
    }>;

interface SourceLine {
  from: number;
  to: number;
  fullTo: number;
  text: string;
  ending: string;
}

interface ScannedLine {
  field: FrontmatterProjectedField;
  keySource: string;
  valueSource: string;
}

const FORBIDDEN_NODE_PREFIX = /(?:^|[\s[,\]])[&*!]/u;
const PLAIN_KEY_DISALLOWED = /[\r\n]/u;

function sourceMode(
  reason: FrontmatterSourceModeReason,
  token: MarkdownFrontmatterToken | null,
): FrontmatterProjection {
  return {
    mode: 'source',
    reason,
    range: token?.range ?? null,
  };
}

function frontmatterToken(source: string): MarkdownFrontmatterToken | null {
  return parseMarkdownKnowledgeIr(source).tokens.find(
    (token): token is MarkdownFrontmatterToken => token.kind === 'frontmatter',
  ) ?? null;
}

function linesInRange(
  source: string,
  range: MarkdownTextRange,
): SourceLine[] {
  const lines: SourceLine[] = [];
  let from = range.from;
  while (from < range.to) {
    let to = from;
    while (to < range.to && source[to] !== '\r' && source[to] !== '\n') to += 1;
    let fullTo = to;
    if (source[fullTo] === '\r' && source[fullTo + 1] === '\n') {
      fullTo += 2;
    } else if (source[fullTo] === '\r' || source[fullTo] === '\n') {
      fullTo += 1;
    }
    lines.push({
      from,
      to,
      fullTo,
      text: source.slice(from, to),
      ending: source.slice(to, fullTo),
    });
    from = fullTo;
  }
  return lines;
}

function findUnquotedColon(line: string): number {
  let single = false;
  let double = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (double) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        double = false;
      }
      continue;
    }
    if (single) {
      if (character === "'" && line[index + 1] === "'") {
        index += 1;
      } else if (character === "'") {
        single = false;
      }
      continue;
    }
    if (character === '"') {
      double = true;
    } else if (character === "'") {
      single = true;
    } else if (character === ':') {
      return index;
    }
  }
  return -1;
}

function valueBoundary(
  line: string,
  from: number,
): {
  valueFrom: number;
  valueTo: number;
  valueSource: string;
  reason: FrontmatterSourceModeReason | null;
} {
  let valueFrom = from;
  while (line[valueFrom] === ' ' || line[valueFrom] === '\t') valueFrom += 1;
  let single = false;
  let double = false;
  let escaped = false;
  let arrayDepth = 0;
  let commentFrom = line.length;
  for (let index = valueFrom; index < line.length; index += 1) {
    const character = line[index];
    if (double) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        double = false;
      }
      continue;
    }
    if (single) {
      if (character === "'" && line[index + 1] === "'") {
        index += 1;
      } else if (character === "'") {
        single = false;
      }
      continue;
    }
    if (character === '"') {
      double = true;
      continue;
    }
    if (character === "'") {
      single = true;
      continue;
    }
    if (character === '{' || character === '}') {
      return {
        valueFrom,
        valueTo: line.length,
        valueSource: '',
        reason: 'nested_structure',
      };
    }
    if (character === '[') {
      arrayDepth += 1;
      if (arrayDepth > 1) {
        return {
          valueFrom,
          valueTo: line.length,
          valueSource: '',
          reason: 'nested_structure',
        };
      }
      continue;
    }
    if (character === ']') {
      arrayDepth -= 1;
      if (arrayDepth < 0) {
        return {
          valueFrom,
          valueTo: line.length,
          valueSource: '',
          reason: 'uncertain_range',
        };
      }
      continue;
    }
    if (
      character === '#'
      && arrayDepth === 0
      && (index === valueFrom || /\s/u.test(line[index - 1]))
    ) {
      commentFrom = index;
      break;
    }
  }
  if (single || double || arrayDepth !== 0) {
    return {
      valueFrom,
      valueTo: line.length,
      valueSource: '',
      reason: 'uncertain_range',
    };
  }
  let valueTo = commentFrom;
  while (valueTo > valueFrom && /[ \t]/u.test(line[valueTo - 1])) valueTo -= 1;
  if (valueTo === valueFrom) {
    valueFrom = from;
    valueTo = from;
  }
  return {
    valueFrom,
    valueTo,
    valueSource: line.slice(valueFrom, valueTo),
    reason: null,
  };
}

function isEditableScalar(value: unknown): value is FrontmatterJsonScalar {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

export function isFrontmatterEditableValue(
  value: unknown,
): value is FrontmatterEditableValue {
  return isEditableScalar(value)
    || (
      Array.isArray(value)
      && value.every(isEditableScalar)
    );
}

function forbiddenSyntaxReason(
  key: string,
  valueSource: string,
): FrontmatterSourceModeReason | null {
  if (key === '<<') return 'merge_key';
  const trimmed = valueSource.trimStart();
  if (trimmed.startsWith('|') || trimmed.startsWith('>')) return 'block_scalar';
  const plain = valueSource.replace(
    /"(?:\\.|[^"\\])*"|'(?:''|[^'])*'/gu,
    quoted => ' '.repeat(quoted.length),
  );
  const forbidden = plain.match(FORBIDDEN_NODE_PREFIX)?.[0].trim();
  if (forbidden === '&' || forbidden === '*') return 'anchor_or_alias';
  if (forbidden === '!') return 'custom_tag';
  return null;
}

function parseSingleFieldLine(
  line: SourceLine,
): ScannedLine | FrontmatterSourceModeReason | null {
  if (line.text.trim().length === 0 || line.text.trimStart().startsWith('#')) {
    return null;
  }
  if (/^[ \t]/u.test(line.text)) return 'nested_structure';
  if (/^(?:%|---(?:\s|$)|\.\.\.(?:\s|$))/u.test(line.text)) {
    return 'directive_or_multiple_documents';
  }
  const colon = findUnquotedColon(line.text);
  if (colon < 0) return 'uncertain_range';
  const rawKey = line.text.slice(0, colon);
  const keySource = rawKey.trim();
  if (!keySource || PLAIN_KEY_DISALLOWED.test(keySource)) return 'unsupported_key';

  let key: unknown;
  try {
    key = yaml.load(keySource);
  } catch {
    return 'invalid_yaml';
  }
  if (typeof key !== 'string' || key.length === 0) return 'unsupported_key';

  const boundary = valueBoundary(line.text, colon + 1);
  if (boundary.reason) return boundary.reason;
  const syntaxReason = forbiddenSyntaxReason(key, boundary.valueSource);
  if (syntaxReason) return syntaxReason;

  let parsedLine: unknown;
  try {
    parsedLine = yaml.load(`${line.text.slice(0, boundary.valueTo)}\n`);
  } catch {
    return 'invalid_yaml';
  }
  if (
    !parsedLine
    || typeof parsedLine !== 'object'
    || Array.isArray(parsedLine)
    || !Object.prototype.hasOwnProperty.call(parsedLine, key)
  ) {
    return 'uncertain_range';
  }
  const value = (parsedLine as Record<string, unknown>)[key];
  if (!isFrontmatterEditableValue(value)) return 'unsupported_value';

  const keyOffset = rawKey.indexOf(keySource);
  return {
    keySource,
    valueSource: boundary.valueSource,
    field: {
      key,
      value,
      lineRange: { from: line.from, to: line.fullTo },
      keyRange: {
        from: line.from + keyOffset,
        to: line.from + keyOffset + keySource.length,
      },
      valueRange: {
        from: line.from + boundary.valueFrom,
        to: line.from + boundary.valueTo,
      },
    },
  };
}

export function projectFrontmatterFromToken(
  source: string,
  token: MarkdownFrontmatterToken | null,
): FrontmatterProjection {
  if (!token) return sourceMode('absent', null);
  const content = source.slice(token.contentRange.from, token.contentRange.to);

  const fields: FrontmatterProjectedField[] = [];
  const keys = new Set<string>();
  for (const line of linesInRange(source, token.contentRange)) {
    const scanned = parseSingleFieldLine(line);
    if (typeof scanned === 'string') return sourceMode(scanned, token);
    if (!scanned) continue;
    if (keys.has(scanned.field.key)) return sourceMode('duplicate_key', token);
    keys.add(scanned.field.key);
    fields.push(scanned.field);
  }

  let parsedDocument: unknown;
  try {
    parsedDocument = yaml.load(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return sourceMode(
      /duplicated mapping key/iu.test(message) ? 'duplicate_key' : 'invalid_yaml',
      token,
    );
  }
  if (
    parsedDocument !== null
    && (
      typeof parsedDocument !== 'object'
      || Array.isArray(parsedDocument)
    )
  ) {
    return sourceMode('nested_structure', token);
  }

  const parsedKeys = parsedDocument && typeof parsedDocument === 'object'
    ? Object.keys(parsedDocument)
    : [];
  if (
    parsedKeys.length !== fields.length
    || parsedKeys.some(key => !keys.has(key))
  ) {
    return sourceMode('uncertain_range', token);
  }
  return {
    mode: 'properties',
    range: token.range,
    contentRange: token.contentRange,
    closingRange: token.closingRange,
    fields,
  };
}

export function projectFrontmatter(source: string): FrontmatterProjection {
  return projectFrontmatterFromToken(source, frontmatterToken(source));
}

function formatEditableValue(value: FrontmatterEditableValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => JSON.stringify(item)).join(', ')}]`;
  }
  return JSON.stringify(value);
}

function validNewKey(key: string): boolean {
  return typeof key === 'string'
    && key.trim() === key
    && key.length > 0
    && !/[\p{Cc}]/u.test(key);
}

function insertionLineEnding(
  source: string,
  projection: Extract<FrontmatterProjection, { mode: 'properties' }>,
): string {
  const content = source.slice(
    projection.contentRange.from,
    projection.contentRange.to,
  );
  const endings = content.match(/\r\n|\r|\n/gu);
  return endings?.at(-1) ?? '\n';
}

export function setFrontmatterProperty(
  source: string,
  key: string,
  value: FrontmatterEditableValue,
): FrontmatterPatch {
  if (!validNewKey(key)) return { ok: false, reason: 'invalid_key' };
  if (!isFrontmatterEditableValue(value)) {
    return { ok: false, reason: 'invalid_value' };
  }
  const projection = projectFrontmatter(source);
  if (projection.mode !== 'properties') {
    return { ok: false, reason: projection.reason };
  }
  const existing = projection.fields.find(field => field.key === key);
  if (existing) {
    const needsSeparator = existing.valueRange.from === existing.valueRange.to
      && source[existing.valueRange.from - 1] === ':';
    return {
      ok: true,
      from: existing.valueRange.from,
      to: existing.valueRange.to,
      insert: `${needsSeparator ? ' ' : ''}${formatEditableValue(value)}`,
    };
  }
  const ending = insertionLineEnding(source, projection);
  return {
    ok: true,
    from: projection.closingRange.from,
    to: projection.closingRange.from,
    insert: `${JSON.stringify(key)}: ${formatEditableValue(value)}${ending}`,
  };
}

export function deleteFrontmatterProperty(
  source: string,
  key: string,
): FrontmatterPatch {
  const projection = projectFrontmatter(source);
  if (projection.mode !== 'properties') {
    return { ok: false, reason: projection.reason };
  }
  const existing = projection.fields.find(field => field.key === key);
  if (!existing) return { ok: false, reason: 'missing_key' };
  return {
    ok: true,
    from: existing.lineRange.from,
    to: existing.lineRange.to,
    insert: '',
  };
}

export function applyFrontmatterPatch(
  source: string,
  patch: FrontmatterPatch,
): string {
  if (!patch.ok) return source;
  return source.slice(0, patch.from) + patch.insert + source.slice(patch.to);
}
