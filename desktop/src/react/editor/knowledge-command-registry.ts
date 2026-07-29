import {
  EditorSelection,
  Prec,
  Transaction,
  type Extension,
} from '@codemirror/state';
import {
  keymap,
  ViewPlugin,
  type EditorView,
  type KeyBinding,
  type ViewUpdate,
} from '@codemirror/view';

export type KnowledgeCommandId =
  | 'bold'
  | 'italic'
  | 'inline-code'
  | 'markdown-link'
  | 'wikilink'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'heading-5'
  | 'heading-6'
  | 'unordered-list'
  | 'ordered-list'
  | 'task'
  | 'quote'
  | 'code-block'
  | 'divider';

export interface KnowledgeCommandDefinition {
  readonly id: KnowledgeCommandId;
  readonly icon: string;
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly aliases: readonly string[];
  readonly kind: 'inline' | 'block';
  readonly template: string;
  readonly cursorOffset: number;
  readonly shortcut?: string;
  readonly formatMarker?: string;
}

export interface KnowledgeCommand extends KnowledgeCommandDefinition {
  readonly label: string;
  readonly description: string;
}

export type KnowledgeCommandTranslator = (key: string) => string;

export interface KnowledgeSlashMenuRequest {
  readonly triggerFrom: number;
  readonly queryTo: number;
  readonly query: string;
  readonly commands: readonly KnowledgeCommand[];
  readonly selectedIndex: number;
  select(index: number): void;
  execute(commandId?: KnowledgeCommandId): boolean;
  dismiss(): void;
}

const command = (
  definition: KnowledgeCommandDefinition,
): KnowledgeCommandDefinition => Object.freeze({
  ...definition,
  aliases: Object.freeze([...definition.aliases]),
});

/**
 * Frozen V1 order. The registry is deliberately declarative: slash commands
 * may only vary by one template, one cursor and inline/block placement.
 */
export const KNOWLEDGE_COMMAND_DEFINITIONS: readonly KnowledgeCommandDefinition[] = Object.freeze([
  command({
    id: 'bold',
    icon: 'B',
    labelKey: 'knowledge.commands.bold.name',
    descriptionKey: 'knowledge.commands.bold.description',
    aliases: ['bold', 'strong', '粗体', '粗體', '太字', '굵게'],
    kind: 'inline',
    template: '****',
    cursorOffset: 2,
    shortcut: 'Mod-B',
    formatMarker: '**',
  }),
  command({
    id: 'italic',
    icon: 'I',
    labelKey: 'knowledge.commands.italic.name',
    descriptionKey: 'knowledge.commands.italic.description',
    aliases: ['italic', 'emphasis', '斜体', '斜體', '斜体字', '기울임'],
    kind: 'inline',
    template: '**',
    cursorOffset: 1,
    shortcut: 'Mod-I',
    formatMarker: '*',
  }),
  command({
    id: 'inline-code',
    icon: '</>',
    labelKey: 'knowledge.commands.inlineCode.name',
    descriptionKey: 'knowledge.commands.inlineCode.description',
    aliases: ['code', 'inlinecode', '行内代码', '行內程式碼', 'インラインコード', '인라인코드'],
    kind: 'inline',
    template: '``',
    cursorOffset: 1,
    shortcut: 'Mod-`',
    formatMarker: '`',
  }),
  command({
    id: 'markdown-link',
    icon: '↗',
    labelKey: 'knowledge.commands.markdownLink.name',
    descriptionKey: 'knowledge.commands.markdownLink.description',
    aliases: ['link', 'markdownlink', '链接', '連結', 'リンク', '링크'],
    kind: 'inline',
    template: '[]()',
    cursorOffset: 1,
    shortcut: 'Mod-K',
  }),
  command({
    id: 'wikilink',
    icon: '[[]]',
    labelKey: 'knowledge.commands.wikilink.name',
    descriptionKey: 'knowledge.commands.wikilink.description',
    aliases: ['wiki', 'wikilink', '双链', '雙鏈', 'ウィキリンク', '위키링크'],
    kind: 'inline',
    template: '[[]]',
    cursorOffset: 2,
  }),
  ...Array.from({ length: 6 }, (_, index): KnowledgeCommandDefinition => {
    const level = index + 1;
    return command({
      id: `heading-${level}` as KnowledgeCommandId,
      icon: `H${level}`,
      labelKey: `knowledge.commands.heading${level}.name`,
      descriptionKey: `knowledge.commands.heading${level}.description`,
      aliases: [
        `h${level}`,
        `heading${level}`,
        `标题${level}`,
        `標題${level}`,
        `見出し${level}`,
        `제목${level}`,
      ],
      kind: 'block',
      template: `${'#'.repeat(level)} `,
      cursorOffset: level + 1,
    });
  }),
  command({
    id: 'unordered-list',
    icon: '•',
    labelKey: 'knowledge.commands.unorderedList.name',
    descriptionKey: 'knowledge.commands.unorderedList.description',
    aliases: ['bullet', 'unordered', '无序列表', '無序清單', '箇条書き', '글머리'],
    kind: 'block',
    template: '- ',
    cursorOffset: 2,
  }),
  command({
    id: 'ordered-list',
    icon: '1.',
    labelKey: 'knowledge.commands.orderedList.name',
    descriptionKey: 'knowledge.commands.orderedList.description',
    aliases: ['numbered', 'ordered', '有序列表', '編號清單', '番号付き', '번호목록'],
    kind: 'block',
    template: '1. ',
    cursorOffset: 3,
  }),
  command({
    id: 'task',
    icon: '☐',
    labelKey: 'knowledge.commands.task.name',
    descriptionKey: 'knowledge.commands.task.description',
    aliases: ['task', 'todo', '任务', '任務', 'タスク', '작업'],
    kind: 'block',
    template: '- [ ] ',
    cursorOffset: 6,
  }),
  command({
    id: 'quote',
    icon: '❯',
    labelKey: 'knowledge.commands.quote.name',
    descriptionKey: 'knowledge.commands.quote.description',
    aliases: ['quote', 'blockquote', '引用', '引用文', '인용'],
    kind: 'block',
    template: '> ',
    cursorOffset: 2,
  }),
  command({
    id: 'code-block',
    icon: '{}',
    labelKey: 'knowledge.commands.codeBlock.name',
    descriptionKey: 'knowledge.commands.codeBlock.description',
    aliases: ['fence', 'codeblock', '代码块', '程式碼區塊', 'コードブロック', '코드블록'],
    kind: 'block',
    template: '```\n\n```',
    cursorOffset: 4,
  }),
  command({
    id: 'divider',
    icon: '—',
    labelKey: 'knowledge.commands.divider.name',
    descriptionKey: 'knowledge.commands.divider.description',
    aliases: ['divider', 'rule', '分隔线', '分隔線', '区切り線', '구분선'],
    kind: 'block',
    template: '---',
    cursorOffset: 3,
  }),
]);

export function localizeKnowledgeCommands(
  translate: KnowledgeCommandTranslator,
): readonly KnowledgeCommand[] {
  return KNOWLEDGE_COMMAND_DEFINITIONS.map(definition => ({
    ...definition,
    label: translate(definition.labelKey),
    description: translate(definition.descriptionKey),
  }));
}

function normalize(value: string): string {
  return value.toLocaleLowerCase();
}

export function filterKnowledgeCommands(
  commands: readonly KnowledgeCommand[],
  query: string,
): readonly KnowledgeCommand[] {
  const needle = normalize(query);
  if (!needle) return commands;

  const prefix: KnowledgeCommand[] = [];
  const substring: KnowledgeCommand[] = [];
  for (const item of commands) {
    const values = [item.label, ...item.aliases].map(normalize);
    if (values.some(value => value.startsWith(needle))) prefix.push(item);
    else if (values.some(value => value.includes(needle))) substring.push(item);
  }
  return [...prefix, ...substring];
}

function dispatchTemplate(
  view: EditorView,
  from: number,
  to: number,
  insert: string,
  cursor: number,
): void {
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(cursor),
    annotations: Transaction.userEvent.of('input'),
  });
}

function toggleMarker(view: EditorView, marker: string): void {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  if (
    selected.length >= marker.length * 2
    && selected.startsWith(marker)
    && selected.endsWith(marker)
  ) {
    const inner = selected.slice(marker.length, -marker.length);
    dispatchTemplate(view, from, to, inner, from + inner.length);
    return;
  }

  const before = view.state.sliceDoc(Math.max(0, from - marker.length), from);
  const after = view.state.sliceDoc(to, Math.min(view.state.doc.length, to + marker.length));
  if (before === marker && after === marker) {
    view.dispatch({
      changes: [
        { from: from - marker.length, to: from },
        { from: to, to: to + marker.length },
      ],
      selection: EditorSelection.single(from - marker.length, to - marker.length),
      annotations: Transaction.userEvent.of('input'),
    });
    return;
  }

  const insert = `${marker}${selected}${marker}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: selected
      ? EditorSelection.single(from + marker.length, from + marker.length + selected.length)
      : EditorSelection.cursor(from + marker.length),
    annotations: Transaction.userEvent.of('input'),
  });
}

export function executeKnowledgeFormatCommand(
  view: EditorView,
  commandId: 'bold' | 'italic' | 'inline-code' | 'markdown-link',
): boolean {
  if (view.state.readOnly || view.composing || view.state.selection.ranges.length !== 1) {
    return false;
  }
  const definition = KNOWLEDGE_COMMAND_DEFINITIONS.find(item => item.id === commandId);
  if (!definition) return false;
  if (definition.formatMarker) {
    toggleMarker(view, definition.formatMarker);
    view.focus();
    return true;
  }

  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const insert = `[${selected}]()`;
  view.dispatch({
    changes: { from, to, insert },
    selection: selected
      ? EditorSelection.single(from + 1, from + 1 + selected.length)
      : EditorSelection.cursor(from + 1),
    annotations: Transaction.userEvent.of('input'),
  });
  view.focus();
  return true;
}

export function executeKnowledgeSlashCommand(
  view: EditorView,
  definition: KnowledgeCommandDefinition,
  triggerFrom: number,
  queryTo: number,
): boolean {
  if (view.state.readOnly || view.composing) return false;
  if (
    triggerFrom < 0
    || queryTo < triggerFrom + 1
    || queryTo > view.state.doc.length
  ) return false;
  const querySource = view.state.sliceDoc(triggerFrom, queryTo);
  if (!querySource.startsWith('/') || /\s/u.test(querySource.slice(1))) return false;

  const line = view.state.doc.lineAt(triggerFrom);
  const leading = definition.kind === 'block' && triggerFrom > line.from ? '\n' : '';
  const insert = `${leading}${definition.template}`;
  dispatchTemplate(
    view,
    triggerFrom,
    queryTo,
    insert,
    triggerFrom + leading.length + definition.cursorOffset,
  );
  view.focus();
  return true;
}

interface KnowledgeCommandExtensionOptions {
  readonly translate: KnowledgeCommandTranslator;
  readonly onSlashMenuChange: (request: KnowledgeSlashMenuRequest | null) => void;
}

export function createKnowledgeCommandExtensions(
  options: KnowledgeCommandExtensionOptions,
): Extension[] {
  const commands = localizeKnowledgeCommands(options.translate);

  class SlashController {
    private triggerFrom: number | null = null;
    private queryTo: number | null = null;
    private query = '';
    private selectedIndex = 0;

    constructor(readonly view: EditorView) {}

    update(update: ViewUpdate): void {
      if (update.focusChanged && !update.view.hasFocus) {
        this.dismiss();
        return;
      }
      if (this.triggerFrom !== null && this.queryTo !== null && update.docChanged) {
        this.triggerFrom = update.changes.mapPos(this.triggerFrom, -1);
        this.queryTo = update.changes.mapPos(this.queryTo, 1);
      }

      if (this.triggerFrom === null) {
        const typed = update.transactions.some(transaction => (
          transaction.docChanged && transaction.isUserEvent('input.type')
        ));
        const selection = update.state.selection;
        if (
          typed
          && !update.view.composing
          && selection.ranges.length === 1
          && selection.main.empty
          && selection.main.head > 0
          && update.state.sliceDoc(selection.main.head - 1, selection.main.head) === '/'
        ) {
          this.triggerFrom = selection.main.head - 1;
          this.queryTo = selection.main.head;
          this.query = '';
          this.selectedIndex = 0;
        }
      }

      if (this.triggerFrom === null || this.queryTo === null) return;
      const selection = update.state.selection;
      const source = update.state.sliceDoc(this.triggerFrom, this.queryTo);
      if (
        update.view.composing
        || selection.ranges.length !== 1
        || !selection.main.empty
        || selection.main.head !== this.queryTo
        || !source.startsWith('/')
        || /\s/u.test(source.slice(1))
      ) {
        this.dismiss();
        return;
      }
      const query = source.slice(1);
      if (query !== this.query) {
        this.query = query;
        this.selectedIndex = 0;
      }
      this.selectedIndex = Math.min(
        this.selectedIndex,
        Math.max(0, this.results().length - 1),
      );
      this.publish();
    }

    move(delta: number): boolean {
      if (this.triggerFrom === null) return false;
      const results = this.results();
      if (results.length === 0) return true;
      this.selectedIndex = (this.selectedIndex + delta + results.length) % results.length;
      this.publish();
      return true;
    }

    isActive(): boolean {
      return this.triggerFrom !== null;
    }

    moveTo(index: number): boolean {
      if (this.triggerFrom === null) return false;
      const results = this.results();
      if (results.length === 0) return true;
      this.selectedIndex = Math.max(0, Math.min(index, results.length - 1));
      this.publish();
      return true;
    }

    execute(commandId?: KnowledgeCommandId): boolean {
      if (this.triggerFrom === null || this.queryTo === null) return false;
      const results = this.results();
      const selected = commandId
        ? results.find(item => item.id === commandId)
        : results[this.selectedIndex];
      if (!selected) return true;
      const executed = executeKnowledgeSlashCommand(
        this.view,
        selected,
        this.triggerFrom,
        this.queryTo,
      );
      if (executed) this.dismiss();
      return true;
    }

    dismiss(): void {
      if (this.triggerFrom === null) return;
      this.triggerFrom = null;
      this.queryTo = null;
      this.query = '';
      this.selectedIndex = 0;
      options.onSlashMenuChange(null);
    }

    destroy(): void {
      this.dismiss();
    }

    private results(): readonly KnowledgeCommand[] {
      if (this.triggerFrom === null || this.queryTo === null) return [];
      return filterKnowledgeCommands(
        commands,
        this.view.state.sliceDoc(this.triggerFrom + 1, this.queryTo),
      );
    }

    private publish(): void {
      if (this.triggerFrom === null || this.queryTo === null) return;
      const results = this.results();
      options.onSlashMenuChange({
        triggerFrom: this.triggerFrom,
        queryTo: this.queryTo,
        query: this.view.state.sliceDoc(this.triggerFrom + 1, this.queryTo),
        commands: results,
        selectedIndex: this.selectedIndex,
        select: index => {
          this.moveTo(index);
        },
        execute: commandId => this.execute(commandId),
        dismiss: () => this.dismiss(),
      });
    }
  }

  const slashPlugin = ViewPlugin.define(view => new SlashController(view));
  const controller = (view: EditorView): SlashController | null => (
    view.plugin(slashPlugin) as SlashController | null
  );
  const bindings: KeyBinding[] = [
    { key: 'Mod-b', run: view => executeKnowledgeFormatCommand(view, 'bold') },
    { key: 'Mod-i', run: view => executeKnowledgeFormatCommand(view, 'italic') },
    { key: 'Mod-k', run: view => executeKnowledgeFormatCommand(view, 'markdown-link') },
    { key: 'Mod-`', run: view => executeKnowledgeFormatCommand(view, 'inline-code') },
    { key: 'ArrowDown', run: view => controller(view)?.move(1) ?? false },
    { key: 'ArrowUp', run: view => controller(view)?.move(-1) ?? false },
    { key: 'Home', run: view => controller(view)?.moveTo(0) ?? false },
    {
      key: 'End',
      run: view => {
        const active = controller(view);
        if (!active?.isActive()) return false;
        active.moveTo(Number.MAX_SAFE_INTEGER);
        return true;
      },
    },
    { key: 'Enter', run: view => controller(view)?.execute() ?? false },
    {
      key: 'Escape',
      run: view => {
        const active = controller(view);
        if (!active?.isActive()) return false;
        active.dismiss();
        return true;
      },
    },
  ];

  return [slashPlugin, Prec.highest(keymap.of(bindings))];
}
