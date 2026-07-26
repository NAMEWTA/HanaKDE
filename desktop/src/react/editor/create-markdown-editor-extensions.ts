import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  bracketMatching,
  syntaxHighlighting,
} from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import {
  EditorState,
  StateField,
  Transaction,
  type Compartment,
  type Extension,
  type Text,
} from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  type ViewUpdate,
} from '@codemirror/view';
import { codeHighlight, markdownHighlight } from './highlight';
import { markdownTheme, codeTheme } from './theme';
import {
  markdownBlockDecoField,
  markdownDecoPlugin,
  markdownImageContextFacet,
} from './md-decorations';
import { markdownCoverField } from './cover-field';
import {
  markdownBlockHandlePlugin,
  type MarkdownBlockMenuRequest,
} from './markdown-block-handles';
import { markdownBlockSelectionPlugin } from './markdown-block-selection';
import { mermaidDecoField } from './mermaid-field';
import {
  createLinkClickHandler,
  type MarkdownLinkOpenHandler,
} from './link-handler';
import { tableDecoField } from './table-field';
import { csvTableField } from './csv-field';

export type MarkdownEditorMode = 'markdown' | 'code' | 'csv' | 'text';

export type MarkdownEditorCompartments = Readonly<{
  lang: Compartment;
  highlight: Compartment;
  gutter: Compartment;
  conceal: Compartment;
  theme: Compartment;
}>;

export type MarkdownEditorSavePolicy = Readonly<{
  onDocumentChange(update: ViewUpdate): void;
}>;

export type MarkdownEditorAttachmentPolicy = Readonly<{
  onDragOver(event: DragEvent, view: EditorView): boolean;
  onDrop(event: DragEvent, view: EditorView): boolean;
  onPaste(event: ClipboardEvent, view: EditorView): boolean;
}>;

export type MarkdownEditorOpenLinkPolicy = Readonly<{
  open: MarkdownLinkOpenHandler;
}>;

export type MarkdownEditorContentPolicy = Readonly<{
  readOnly: boolean;
  allowTransaction?: (transaction: Transaction) => boolean;
  strictUtf8MaxBytes?: number;
}>;

export const MARKDOWN_EDITOR_MAX_UTF8_BYTES = 10 * 1024 * 1024;

export type CreateMarkdownEditorExtensionsOptions = Readonly<{
  mode: MarkdownEditorMode;
  compartments: MarkdownEditorCompartments;
  filePath?: string;
  getFileUrl?: (filePath: string) => string;
  savePolicy?: MarkdownEditorSavePolicy;
  attachmentPolicy?: MarkdownEditorAttachmentPolicy;
  openLinkPolicy: MarkdownEditorOpenLinkPolicy;
  contentPolicy: MarkdownEditorContentPolicy;
  onOpenBlockMenu?: (request: MarkdownBlockMenuRequest) => void;
  onViewUpdate?: (update: ViewUpdate) => void;
}>;

export function createMarkdownEditorExtensions({
  mode,
  compartments,
  filePath,
  getFileUrl,
  savePolicy,
  attachmentPolicy,
  openLinkPolicy,
  contentPolicy,
  onOpenBlockMenu,
  onViewUpdate,
}: CreateMarkdownEditorExtensionsOptions): Extension[] {
  const isMarkdown = mode === 'markdown';
  const isCsv = mode === 'csv';
  const extensions: Extension[] = [
    ...(isMarkdown ? [] : [drawSelection()]),
    history(),
    bracketMatching(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.contentAttributes.of({ spellcheck: 'false' }),
    EditorView.lineWrapping,
  ];

  if (contentPolicy.strictUtf8MaxBytes !== undefined) {
    extensions.push(createStrictUtf8ContentGate(contentPolicy.strictUtf8MaxBytes));
  }

  if (contentPolicy.allowTransaction) {
    extensions.push(EditorState.transactionFilter.of(transaction => (
      contentPolicy.allowTransaction?.(transaction) === false
        ? []
        : transaction
    )));
  }

  if (isMarkdown && !contentPolicy.readOnly && attachmentPolicy) {
    extensions.push(EditorView.domEventHandlers({
      dragover: (event, view) => attachmentPolicy.onDragOver(event, view),
      drop: (event, view) => attachmentPolicy.onDrop(event, view),
      paste: (event, view) => attachmentPolicy.onPaste(event, view),
    }));
  }

  if (contentPolicy.readOnly) {
    extensions.push(
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    );
  } else if (savePolicy) {
    extensions.push(EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const shouldPersist = update.transactions.every(
        transaction => !transaction.annotation(Transaction.remote),
      );
      if (shouldPersist) savePolicy.onDocumentChange(update);
    }));
  }

  if (onViewUpdate) {
    extensions.push(EditorView.updateListener.of(onViewUpdate));
  }

  extensions.push(
    compartments.gutter.of(isMarkdown || isCsv ? [] : lineNumbers()),
    compartments.lang.of(
      isMarkdown
        ? markdown({ base: markdownLanguage, codeLanguages: languages })
        : [],
    ),
    compartments.highlight.of(
      syntaxHighlighting(isMarkdown ? markdownHighlight : codeHighlight),
    ),
    compartments.conceal.of(isMarkdown ? [
      markdownImageContextFacet.of({ filePath, getFileUrl }),
      markdownDecoPlugin,
      markdownCoverField,
      markdownBlockDecoField,
      mermaidDecoField,
    ] : []),
  );

  if (isMarkdown && !contentPolicy.readOnly) {
    extensions.push(
      markdownBlockSelectionPlugin(),
      markdownBlockHandlePlugin({
        onOpenMenu: onOpenBlockMenu ?? (() => {}),
      }),
    );
  }
  if (isMarkdown) extensions.push(tableDecoField);
  if (isCsv) extensions.push(csvTableField);
  extensions.push(
    compartments.theme.of(isMarkdown || isCsv ? markdownTheme : codeTheme),
    createLinkClickHandler(openLinkPolicy.open),
  );
  if (!isMarkdown && !isCsv) extensions.push(highlightActiveLine());
  return extensions;
}

function createStrictUtf8ContentGate(maxBytes: number): Extension {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('strictUtf8MaxBytes must be a non-negative safe integer');
  }

  const byteLengthField = StateField.define<number>({
    create(state) {
      const byteLength = strictUtf8ByteLength(state.doc, maxBytes);
      if (byteLength === null) {
        throw new RangeError(`initial editor content must be strict UTF-8 and at most ${maxBytes} bytes`);
      }
      return byteLength;
    },
    update(byteLength, transaction) {
      if (!transaction.docChanged) return byteLength;
      return changedDocumentByteLength(transaction, byteLength)
        // 增量计算拒绝的 transaction 不会被应用；若仍到达此处（例如上游
        // extension 重写了 changes），对新文档全量重算，避免计数漂移。
        ?? strictUtf8ByteLength(transaction.newDoc, Number.POSITIVE_INFINITY)
        ?? byteLength;
    },
  });

  return [
    byteLengthField,
    EditorState.transactionFilter.of(transaction => {
      if (!transaction.docChanged) return transaction;
      const nextByteLength = changedDocumentByteLength(
        transaction,
        transaction.startState.field(byteLengthField),
      );
      return nextByteLength !== null && nextByteLength <= maxBytes
        ? transaction
        : [];
    }),
  ];
}

function changedDocumentByteLength(
  transaction: Transaction,
  initialByteLength: number,
): number | null {
  let nextByteLength: number | null = initialByteLength;
  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (nextByteLength === null) return;
    if (
      splitsSurrogatePair(transaction.startState.doc, fromA)
      || splitsSurrogatePair(transaction.startState.doc, toA)
    ) {
      nextByteLength = null;
      return;
    }
    const removedBytes = strictUtf8ByteLength(
      transaction.startState.doc,
      Number.POSITIVE_INFINITY,
      fromA,
      toA,
    );
    const insertedBytes = strictUtf8ByteLength(inserted, Number.POSITIVE_INFINITY);
    if (removedBytes === null || insertedBytes === null) {
      nextByteLength = null;
      return;
    }
    nextByteLength += insertedBytes - removedBytes;
  });
  return nextByteLength;
}

function strictUtf8ByteLength(
  text: Text,
  maxBytes: number,
  from = 0,
  to = text.length,
): number | null {
  const iterator = text.iterRange(from, to);
  let byteLength = 0;
  let pendingHighSurrogate = false;
  while (!iterator.next().done) {
    const chunk = iterator.value;
    for (let index = 0; index < chunk.length; index += 1) {
      const codeUnit = chunk.charCodeAt(index);
      if (pendingHighSurrogate) {
        if (!isLowSurrogate(codeUnit)) return null;
        byteLength += 4;
        pendingHighSurrogate = false;
      } else if (isHighSurrogate(codeUnit)) {
        pendingHighSurrogate = true;
      } else if (isLowSurrogate(codeUnit)) {
        return null;
      } else if (codeUnit <= 0x7f) {
        byteLength += 1;
      } else if (codeUnit <= 0x7ff) {
        byteLength += 2;
      } else {
        byteLength += 3;
      }
      if (byteLength > maxBytes) return null;
    }
  }
  return pendingHighSurrogate ? null : byteLength;
}

function splitsSurrogatePair(text: Text, position: number): boolean {
  if (position <= 0 || position >= text.length) return false;
  const left = text.sliceString(position - 1, position).charCodeAt(0);
  const right = text.sliceString(position, position + 1).charCodeAt(0);
  return isHighSurrogate(left) && isLowSurrogate(right);
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}
