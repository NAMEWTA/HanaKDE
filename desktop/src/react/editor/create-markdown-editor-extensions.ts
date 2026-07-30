import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { bracketMatching, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import {
  Emoji,
  GFM,
  Subscript,
  Superscript,
} from '@lezer/markdown';
import {
  Compartment,
  EditorState,
  Prec,
  type Extension,
} from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import type { MarkdownImageContext } from '../utils/markdown';
import { csvTableField } from './csv-field';
import { frontmatterField } from './frontmatter-field';
import { markdownCoverField } from './cover-field';
import { codeHighlight, markdownHighlight } from './highlight';
import { createLinkClickHandler, type MarkdownLinkOpenHandler } from './link-handler';
import {
  createKnowledgeLinkField,
  type KnowledgeLinkFieldConfig,
} from './knowledge-link-field';
import {
  markdownDecoPlugin,
  markdownImageContextFacet,
} from './md-decorations';
import {
  knowledgeMarkdownModeExtensions,
  type KnowledgeMarkdownViewMode,
} from './knowledge-live-preview';
import { knowledgeEnterCommand } from './knowledge-enter-commands';
import {
  knowledgeIndentCommand,
  knowledgeOutdentCommand,
} from './knowledge-indent-commands';
import { knowledgeSourceNavigationKeymap } from './knowledge-source-navigation';
import {
  createKnowledgeCommandExtensions,
  type KnowledgeCommandTranslator,
  type KnowledgeSlashMenuRequest,
} from './knowledge-command-registry';
import { knowledgeCodeBlockField } from './knowledge-code-block-field';
import { knowledgeTableField } from './knowledge-table-field';
import {
  markdownBlockHandlePlugin,
  type MarkdownBlockMenuRequest,
} from './markdown-block-handles';
import { markdownBlockSelectionPlugin } from './markdown-block-selection';
import { knowledgeMermaidField } from './knowledge-mermaid-field';
import { knowledgeMathField } from './knowledge-math-field';
import {
  knowledgeFootnoteField,
} from './knowledge-footnote-field';
import {
  createKnowledgeEditorAutocomplete,
} from './knowledge-link-completion';
import {
  createKnowledgeSafeHtmlField,
  type KnowledgeSafeHtmlFieldConfig,
} from './knowledge-safe-html-field';
import {
  knowledgeAttachmentHistoryExtension,
  knowledgeAttachmentHistoryKeymap,
} from './knowledge-attachment-history';
import {
  knowledgeFindHighlightExtension,
} from './knowledge-find-state';
import { taskField } from './task-field';
import { codeTheme, markdownTheme } from './theme';

export interface MarkdownEditorCompartments {
  lang: Compartment;
  highlight: Compartment;
  gutter: Compartment;
  conceal: Compartment;
  theme: Compartment;
}

export interface CreateMarkdownEditorExtensionsOptions {
  mode: 'markdown' | 'code' | 'csv' | 'text';
  markdownDisplayMode?: KnowledgeMarkdownViewMode;
  readOnly: boolean;
  compartments: MarkdownEditorCompartments;
  imageContext: MarkdownImageContext;
  attachmentExtension?: Extension;
  changeExtension?: Extension;
  observeExtension: Extension;
  onManualSave?: () => boolean;
  onOpenBlockMenu: (request: MarkdownBlockMenuRequest) => void;
  onOpenLink?: MarkdownLinkOpenHandler;
  knowledgeLinks?: KnowledgeLinkFieldConfig;
  knowledgeSafeHtml?: KnowledgeSafeHtmlFieldConfig;
  knowledgeFind?: {
    onRequest(command: 'find' | 'replace', view: EditorView): void;
  };
  knowledgeCommands?: {
    translate: KnowledgeCommandTranslator;
    onSlashMenuChange: (request: KnowledgeSlashMenuRequest | null) => void;
  };
}

export function createMarkdownEditorCompartments(): MarkdownEditorCompartments {
  return {
    lang: new Compartment(),
    highlight: new Compartment(),
    gutter: new Compartment(),
    conceal: new Compartment(),
    theme: new Compartment(),
  };
}

export interface CreateMarkdownLivePreviewExtensionsOptions {
  imageContext: MarkdownImageContext;
  knowledgeLinks?: KnowledgeLinkFieldConfig;
  knowledgeSafeHtml?: KnowledgeSafeHtmlFieldConfig;
}

export function createMarkdownLivePreviewExtensions(
  options: CreateMarkdownLivePreviewExtensionsOptions,
): Extension[] {
  return [
    markdownImageContextFacet.of(options.imageContext),
    markdownDecoPlugin,
    ...(options.knowledgeLinks
      ? [createKnowledgeLinkField(options.knowledgeLinks)]
      : []),
    ...(options.knowledgeSafeHtml
      ? [createKnowledgeSafeHtmlField(options.knowledgeSafeHtml)]
      : []),
    taskField,
    frontmatterField,
    markdownCoverField,
    knowledgeMermaidField,
    knowledgeMathField,
    knowledgeFootnoteField,
    knowledgeTableField,
    knowledgeCodeBlockField,
  ];
}

export function createMarkdownEditorExtensions(
  options: CreateMarkdownEditorExtensionsOptions,
): Extension[] {
  const {
    mode,
    markdownDisplayMode = 'live-preview',
    readOnly,
    compartments,
    imageContext,
    attachmentExtension,
    changeExtension,
    observeExtension,
    onManualSave,
    onOpenBlockMenu,
    onOpenLink,
    knowledgeLinks,
    knowledgeSafeHtml,
    knowledgeFind,
    knowledgeCommands,
  } = options;
  const isMarkdown = mode === 'markdown';
  const isCsv = mode === 'csv';
  const extensions: Extension[] = [
    ...(isMarkdown ? [] : [drawSelection()]),
    history(),
    bracketMatching(),
    ...(isMarkdown
      ? [
        knowledgeAttachmentHistoryExtension,
        knowledgeFindHighlightExtension,
        ...(!readOnly && knowledgeCommands
          ? createKnowledgeCommandExtensions(knowledgeCommands)
          : []),
        ...(!readOnly
          ? [createKnowledgeEditorAutocomplete(knowledgeLinks?.completion)]
          : []),
        Prec.highest(keymap.of([
          ...(knowledgeFind ? [
            {
              key: 'Mod-f',
              run: (view: EditorView) => {
                knowledgeFind.onRequest('find', view);
                return true;
              },
            },
            {
              key: 'Mod-h',
              run: (view: EditorView) => {
                knowledgeFind.onRequest('replace', view);
                return true;
              },
            },
          ] : []),
          ...knowledgeSourceNavigationKeymap,
          {
            key: 'Enter',
            run: readOnly ? () => true : knowledgeEnterCommand,
          },
          ...(!readOnly ? [
            { key: 'Tab', run: knowledgeIndentCommand },
            { key: 'Shift-Tab', run: knowledgeOutdentCommand },
          ] : []),
        ])),
      ]
      : []),
    keymap.of([
      ...(onManualSave ? [{ key: 'Mod-s', run: onManualSave }] : []),
      ...defaultKeymap,
      ...knowledgeAttachmentHistoryKeymap,
      ...historyKeymap,
    ]),
    EditorView.contentAttributes.of({ spellcheck: 'false' }),
    EditorView.lineWrapping,
    ...(attachmentExtension ? [attachmentExtension] : []),
    ...(readOnly
      ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
      : changeExtension ? [changeExtension] : []),
    observeExtension,
    compartments.gutter.of(isMarkdown || isCsv ? [] : lineNumbers()),
    compartments.lang.of(
      isMarkdown
        ? markdown({
          extensions: [GFM, Subscript, Superscript, Emoji],
          codeLanguages: languages,
        })
        : [],
    ),
    compartments.highlight.of(
      syntaxHighlighting(isMarkdown ? markdownHighlight : codeHighlight),
    ),
    compartments.conceal.of(isMarkdown
      ? knowledgeMarkdownModeExtensions(
          markdownDisplayMode,
          createMarkdownLivePreviewExtensions({
            imageContext,
            knowledgeLinks,
            knowledgeSafeHtml,
          }),
        )
      : []),
    ...(isMarkdown && !readOnly ? [
      markdownBlockSelectionPlugin(),
      markdownBlockHandlePlugin({ onOpenMenu: onOpenBlockMenu }),
    ] : []),
    ...(isCsv ? [csvTableField] : []),
    compartments.theme.of(isMarkdown || isCsv ? markdownTheme : codeTheme),
    ...(knowledgeLinks ? [] : [createLinkClickHandler(onOpenLink)]),
  ];

  if (!isMarkdown && !isCsv) extensions.push(highlightActiveLine());
  return extensions;
}
