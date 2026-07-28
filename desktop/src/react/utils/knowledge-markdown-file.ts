import {
  decodeKnowledgeMarkdown,
  knowledgeMarkdownContentGate,
  type MarkdownContentGateRejectionReason,
} from '../components/preview/MarkdownEditorSurface';
import type {
  KnowledgeDocumentFormat,
} from '../stores/knowledge-document-registry';
import {
  base64FromBytes,
  bytesFromBase64,
} from './base64-bytes';

export {
  base64FromBytes as knowledgeBase64FromBytes,
  bytesFromBase64 as knowledgeBytesFromBase64,
};

export type KnowledgeMarkdownDecodeResult =
  | {
      ok: true;
      content: string;
      format: KnowledgeDocumentFormat;
      byteLength: number;
    }
  | {
      ok: false;
      reason: MarkdownContentGateRejectionReason | 'invalid_base64';
      byteLength: number;
    };

export type KnowledgeMarkdownEncodeResult =
  | {
      ok: true;
      base64: string;
      byteLength: number;
    }
  | {
      ok: false;
      reason: MarkdownContentGateRejectionReason;
      byteLength: number;
    };

function lineEndingFormat(content: string): Pick<
  KnowledgeDocumentFormat,
  'lineEnding' | 'mixedLineEndings'
> {
  let crlf = 0;
  let lf = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) !== 0x0a) continue;
    if (index > 0 && content.charCodeAt(index - 1) === 0x0d) crlf += 1;
    else lf += 1;
  }
  return {
    lineEnding: crlf > lf ? 'crlf' : 'lf',
    mixedLineEndings: crlf > 0 && lf > 0,
  };
}

export function decodeKnowledgeMarkdownFile(
  base64: string,
): KnowledgeMarkdownDecodeResult {
  const bytes = bytesFromBase64(base64);
  if (!bytes) {
    return { ok: false, reason: 'invalid_base64', byteLength: 0 };
  }
  const decoded = decodeKnowledgeMarkdown(bytes);
  if (!decoded.allowed) return { ok: false, ...decoded };
  const endings = lineEndingFormat(decoded.content);
  return {
    ok: true,
    content: decoded.content.replace(/\r\n/g, '\n'),
    format: {
      hadBom: decoded.hadBom ?? false,
      ...endings,
    },
    byteLength: bytes.byteLength,
  };
}

export function encodeKnowledgeMarkdownFile(
  content: string,
  format: KnowledgeDocumentFormat,
): KnowledgeMarkdownEncodeResult {
  const gated = knowledgeMarkdownContentGate({ content });
  if (!gated.allowed) return { ok: false, ...gated };
  const diskText = format.lineEnding === 'crlf'
    ? gated.content.replace(/\n/g, '\r\n')
    : gated.content;
  const encoded = new TextEncoder().encode(
    format.hadBom ? `\ufeff${diskText}` : diskText,
  );
  const byteGate = decodeKnowledgeMarkdown(encoded);
  if (!byteGate.allowed) return { ok: false, ...byteGate };
  return {
    ok: true,
    base64: base64FromBytes(encoded),
    byteLength: encoded.byteLength,
  };
}
