import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionSource,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import type {
  KnowledgeResourceAddress,
} from '../../../../shared/knowledge-workspace-contract.ts';
import {
  parseMarkdownKnowledgeIr,
} from '../../../../lib/knowledge-workspace/markdown-knowledge-ir.ts';
import type {
  RendererResourceListResult,
} from '../services/knowledge-workspace-client';
import {
  knowledgeFootnoteCompletionSource,
} from './knowledge-footnote-field';

export interface KnowledgeLinkCompletionConfig {
  pageAddress: KnowledgeResourceAddress;
  listDirectory(
    address: KnowledgeResourceAddress,
    options: { signal: AbortSignal },
  ): Promise<RendererResourceListResult>;
}

const EMBEDDABLE_EXTENSIONS = new Set([
  'aac',
  'avif',
  'bmp',
  'flac',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'm4a',
  'm4v',
  'md',
  'mov',
  'mp3',
  'mp4',
  'oga',
  'ogg',
  'ogv',
  'pdf',
  'png',
  'wav',
  'weba',
  'webm',
  'webp',
]);

const pathCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function joinRelativePath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function comparePaths(left: string, right: string): number {
  const natural = pathCollator.compare(left, right);
  if (natural !== 0) return natural;
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedCaseFold(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase();
}

function extensionOf(relativePath: string): string {
  const name = relativePath.split('/').at(-1) ?? relativePath;
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLocaleLowerCase();
}

function isEmbeddable(relativePath: string): boolean {
  return EMBEDDABLE_EXTENSIONS.has(extensionOf(relativePath));
}

function completionExcluded(
  context: CompletionContext,
  from: number,
): boolean {
  const line = context.state.doc.lineAt(from);
  const prefix = context.state.sliceDoc(line.from, from);
  let inlineFenceLength = 0;
  for (let index = 0; index < prefix.length;) {
    if (
      prefix[index] !== '`'
      || (index > 0 && prefix[index - 1] === '\\')
    ) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (prefix[end] === '`') end += 1;
    const length = end - index;
    if (inlineFenceLength === 0) inlineFenceLength = length;
    else if (inlineFenceLength === length) inlineFenceLength = 0;
    index = end;
  }
  if (inlineFenceLength > 0) return true;
  const prefixLines = context.state.sliceDoc(0, from).split(/\r?\n/u);
  if (
    prefixLines[0] === '---'
    && !prefixLines.slice(1).some(value => value === '---' || value === '...')
  ) {
    return true;
  }
  return parseMarkdownKnowledgeIr(context.state.doc.toString()).tokens.some(
    token => (
      (
        token.kind === 'frontmatter'
        || token.kind === 'fenced_code'
        || token.kind === 'indented_code'
        || token.kind === 'inline_code'
      )
      && from >= token.range.from
      && from < token.range.to
    ),
  );
}

export async function listKnowledgeLinkCandidates(
  config: KnowledgeLinkCompletionConfig,
  options: {
    embedded: boolean;
    query: string;
    signal: AbortSignal;
  },
): Promise<string[]> {
  const pending = [''];
  const files: string[] = [];
  while (pending.length > 0) {
    if (options.signal.aborted) {
      throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
    const relativePath = pending.shift() ?? '';
    const result = await config.listDirectory({
      sourceKey: config.pageAddress.sourceKey,
      relativePath,
    }, {
      signal: options.signal,
    });
    for (const item of result.items) {
      if (relativePath === '' && item.name === '.trash') continue;
      const childPath = joinRelativePath(relativePath, item.name);
      if (item.isDirectory) pending.push(childPath);
      else if (!options.embedded || isEmbeddable(childPath)) files.push(childPath);
    }
  }
  const query = normalizedCaseFold(options.query);
  return files
    .filter(path => normalizedCaseFold(path).includes(query))
    .sort(comparePaths);
}

export function createKnowledgeLinkCompletionSource(
  config: KnowledgeLinkCompletionConfig,
): CompletionSource {
  return async (context) => {
    if (context.state.readOnly) return null;
    const match = context.matchBefore(/!?\[\[[^\]\r\n]*$/u);
    if (!match || completionExcluded(context, match.from)) return null;
    const embedded = match.text.startsWith('![[');
    const query = match.text.slice(embedded ? 3 : 2);
    const controller = new AbortController();
    context.addEventListener('abort', () => controller.abort(), {
      onDocChange: true,
    });
    let candidates: string[];
    try {
      candidates = await listKnowledgeLinkCandidates(config, {
        embedded,
        query,
        signal: controller.signal,
      });
    } catch {
      return null;
    }
    if (controller.signal.aborted) return null;
    const options: Completion[] = candidates.map(relativePath => ({
      label: relativePath,
      apply(view, _completion, from, to) {
        const inserted = `${embedded ? '!' : ''}[[${relativePath}]]`;
        view.dispatch({
          changes: { from, to, insert: inserted },
          selection: { anchor: from + inserted.length },
          userEvent: 'input.complete',
        });
      },
    }));
    return {
      from: match.from,
      options,
      filter: false,
    };
  };
}

export function createKnowledgeEditorAutocomplete(
  config?: KnowledgeLinkCompletionConfig,
): Extension {
  return autocompletion({
    override: [
      ...(config ? [createKnowledgeLinkCompletionSource(config)] : []),
      knowledgeFootnoteCompletionSource,
    ],
  });
}
