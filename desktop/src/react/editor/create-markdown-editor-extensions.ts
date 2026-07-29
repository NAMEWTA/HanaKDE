import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { bracketMatching, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
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
  markdownBlockDecoField,
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
import {
  createKnowledgeCommandExtensions,
  type KnowledgeCommandTranslator,
  type KnowledgeSlashMenuRequest,
} from './knowledge-command-registry';
import {
  markdownBlockHandlePlugin,
  type MarkdownBlockMenuRequest,
} from './markdown-block-handles';
import { markdownBlockSelectionPlugin } from './markdown-block-selection';
import { mermaidDecoField } from './mermaid-field';
import { tableDecoField } from './table-field';
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
    taskField,
    frontmatterField,
    markdownCoverField,
    markdownBlockDecoField,
    mermaidDecoField,
    tableDecoField,
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
        ...(!readOnly && knowledgeCommands
          ? createKnowledgeCommandExtensions(knowledgeCommands)
          : []),
        Prec.highest(keymap.of([{
          key: 'Enter',
          run: readOnly ? () => true : knowledgeEnterCommand,
        }, ...(!readOnly ? [
          { key: 'Tab', run: knowledgeIndentCommand },
          { key: 'Shift-Tab', run: knowledgeOutdentCommand },
        ] : [])])),
      ]
      : []),
    keymap.of([
      ...(onManualSave ? [{ key: 'Mod-s', run: onManualSave }] : []),
      ...defaultKeymap,
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
      isMarkdown ? markdown({ base: markdownLanguage, codeLanguages: languages }) : [],
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
