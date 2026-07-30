import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type {
  KnowledgeSourceDto,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import {
  knowledgeWorkspaceClient,
  type KnowledgeWorkspaceClient,
  type RendererKnowledgeSearchGroup,
  type RendererKnowledgeSearchItem,
  type RendererKnowledgeSearchScope,
} from '../../services/knowledge-workspace-client';
import styles from './KnowledgeWorkspace.module.css';

const tr = (
  key: string,
  vars?: Record<string, string | number>,
) => window.t?.(key, vars) ?? key;

export interface KnowledgeTagNavigation {
  tag: string;
  sourceKey: string;
  revision: number;
}

export interface KnowledgeSearchProps {
  client?: KnowledgeWorkspaceClient;
  sources: readonly KnowledgeSourceDto[];
  tagNavigation?: KnowledgeTagNavigation | null;
  onOpen(item: RendererKnowledgeSearchItem, sourceName: string): void;
}

export function KnowledgeSearch({
  client = knowledgeWorkspaceClient,
  sources,
  tagNavigation = null,
  onOpen,
}: KnowledgeSearchProps) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<RendererKnowledgeSearchScope | null>(null);
  const [groups, setGroups] = useState<RendererKnowledgeSearchGroup[]>([]);
  const [status, setStatus] =
    useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const resultButtonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const requestRevisionRef = useRef(0);
  const tagNavigationRevision = tagNavigation?.revision;
  const tagNavigationSourceKey = tagNavigation?.sourceKey;
  const tagNavigationTag = tagNavigation?.tag;

  const runSearch = useCallback(async (
    searchQuery: string,
    searchScope: RendererKnowledgeSearchScope | null,
    cursors?: Record<string, string>,
    appendSourceKey?: string,
  ) => {
    if (Array.from(searchQuery).length === 0) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const revision = requestRevisionRef.current + 1;
    requestRevisionRef.current = revision;
    setStatus('loading');
    setErrorCode(null);
    try {
      const result = await client.searchKnowledge({
        query: searchQuery,
        ...(searchScope ? { scope: searchScope } : {}),
        ...(cursors ? { cursors } : {}),
      }, { signal: controller.signal });
      if (controller.signal.aborted || revision !== requestRevisionRef.current) {
        return;
      }
      setGroups((previous) => appendSourceKey
        ? result.groups.map((next) => {
          if (next.sourceKey !== appendSourceKey || next.state !== 'ready') {
            return previous.find((group) =>
              group.sourceKey === next.sourceKey
            ) ?? next;
          }
          const before = previous.find((group) =>
            group.sourceKey === appendSourceKey
          );
          return before?.state === 'ready'
            ? { ...next, items: [...before.items, ...next.items] }
            : next;
        })
        : result.groups);
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus('error');
      setErrorCode(error instanceof Error ? error.message : 'search_failed');
    }
  }, [client]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (
      tagNavigationRevision === undefined
      || tagNavigationSourceKey === undefined
      || tagNavigationTag === undefined
    ) return;
    const tagQuery = tagNavigationTag.replace(/^#/u, '');
    const nextScope = {
      kind: 'tag' as const,
      sourceKey: tagNavigationSourceKey,
    };
    setQuery(tagQuery);
    setScope(nextScope);
    void runSearch(tagQuery, nextScope);
  }, [
    runSearch,
    tagNavigationRevision,
    tagNavigationSourceKey,
    tagNavigationTag,
  ]);

  const searchTag = (
    tag: string,
    sourceKey: string,
  ) => {
    const tagQuery = tag.replace(/^#/u, '');
    const nextScope = { kind: 'tag' as const, sourceKey };
    setQuery(tagQuery);
    setScope(nextScope);
    void runSearch(tagQuery, nextScope);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void runSearch(query, scope);
  };

  const moveResultFocus = (
    event: KeyboardEvent<HTMLElement>,
    direction: 1 | -1,
  ) => {
    const buttons = resultButtonsRef.current.filter(
      (button): button is HTMLButtonElement => Boolean(button),
    );
    if (buttons.length === 0) return;
    event.preventDefault();
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = current < 0
      ? (direction === 1 ? 0 : buttons.length - 1)
      : (current + direction + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  const scopedSource = scope
    ? sources.find((source) => source.sourceKey === scope.sourceKey)
    : null;
  let resultIndex = 0;
  const resultCount = groups.reduce((count, group) =>
    count + (group.state === 'ready' ? group.items.length : 0), 0);

  return (
    <section
      className={styles.searchPanel}
      role="search"
      aria-label={tr('knowledge.search.label')}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') moveResultFocus(event, 1);
        if (event.key === 'ArrowUp') moveResultFocus(event, -1);
        if (event.key === 'Escape') {
          controllerRef.current?.abort();
          setGroups([]);
          setStatus('idle');
        }
      }}
    >
      <form className={styles.searchForm} onSubmit={submit}>
        <label className={styles.searchInputLabel}>
          <span className={styles.visuallyHidden}>
            {tr('knowledge.search.input')}
          </span>
          <input
            className={styles.searchInput}
            type="search"
            maxLength={1024}
            value={query}
            placeholder={tr('knowledge.search.placeholder')}
            aria-describedby={scope ? 'knowledge-search-scope' : undefined}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {scope && (
          <span
            className={styles.searchScope}
            id="knowledge-search-scope"
            data-source-key={scope.sourceKey}
          >
            {tr('knowledge.search.scope', {
              source: scopedSource?.displayName ?? scope.sourceKey,
            })}
            <button
              className={styles.searchScopeClear}
              type="button"
              aria-label={tr('knowledge.search.clearScope')}
              onClick={() => setScope(null)}
            >
              ×
            </button>
          </span>
        )}
        <button
          className={styles.searchSubmit}
          type="submit"
          disabled={Array.from(query).length === 0 || status === 'loading'}
        >
          {tr('knowledge.search.submit')}
        </button>
      </form>

      <p className={styles.visuallyHidden} role="status" aria-live="polite">
        {status === 'loading'
          ? tr('knowledge.search.loading')
          : status === 'ready'
            ? tr('knowledge.search.resultCount', { count: resultCount })
            : ''}
      </p>

      {(groups.length > 0 || status === 'error') && (
        <div className={styles.searchResults}>
          {status === 'error' && (
            <div className={styles.searchError} role="alert">
              <span>{tr('knowledge.search.error')}</span>
              {errorCode && <span className={styles.visuallyHidden}>{errorCode}</span>}
              <button type="button" onClick={() => void runSearch(query, scope)}>
                {tr('knowledge.retry')}
              </button>
            </div>
          )}
          {groups.map((group) => (
            <section
              className={styles.searchGroup}
              key={group.sourceKey}
              aria-labelledby={`knowledge-search-${group.sourceKey}`}
            >
              <h3
                className={styles.searchGroupHeading}
                id={`knowledge-search-${group.sourceKey}`}
              >
                {group.displayName}
              </h3>
              {group.state === 'error' ? (
                <p className={styles.searchGroupError} role="alert">
                  {tr('knowledge.search.sourceError', {
                    source: group.displayName,
                  })}
                </p>
              ) : (
                <>
                  <ul className={styles.searchResultList}>
                    {group.items.map((item) => {
                      const buttonIndex = resultIndex;
                      resultIndex += 1;
                      return (
                        <li key={`${item.address.sourceKey}:${item.address.relativePath}`}>
                          <button
                            className={styles.searchResult}
                            type="button"
                            ref={(element) => {
                              resultButtonsRef.current[buttonIndex] = element;
                            }}
                            onClick={() => onOpen(item, group.displayName)}
                          >
                            <span className={styles.searchResultTitle}>
                              {item.title}
                            </span>
                            <span className={styles.searchResultPath}>
                              {item.address.relativePath}
                            </span>
                            {item.snippets.map((snippet, index) => (
                              <span
                                className={styles.searchSnippet}
                                key={`${snippet.field}:${index}`}
                              >
                                {snippet.text}
                              </span>
                            ))}
                          </button>
                          {tagsFromSearchItem(item).map((tag) => (
                            <button
                              className={styles.searchTag}
                              type="button"
                              key={tag}
                              aria-label={tr('knowledge.search.tag', {
                                tag,
                                source: group.displayName,
                              })}
                              onClick={() => searchTag(tag, group.sourceKey)}
                            >
                              #{tag}
                            </button>
                          ))}
                        </li>
                      );
                    })}
                  </ul>
                  {group.nextCursor && (
                    <button
                      className={styles.searchMore}
                      type="button"
                      onClick={() => void runSearch(
                        query,
                        scope,
                        { [group.sourceKey]: group.nextCursor! },
                        group.sourceKey,
                      )}
                    >
                      {tr('knowledge.search.more', {
                        source: group.displayName,
                      })}
                    </button>
                  )}
                </>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function tagsFromSearchItem(
  item: RendererKnowledgeSearchItem,
): string[] {
  const tags = new Set<string>();
  for (const snippet of item.snippets) {
    if (snippet.field !== 'body' && snippet.field !== 'metadata') continue;
    for (const match of snippet.text.matchAll(
      /(?:^|[\p{Z}\s])#([\p{L}\p{N}_/-]+)/gu,
    )) {
      if (match[1]) tags.add(match[1].normalize('NFC'));
    }
  }
  return [...tags].slice(0, 8);
}
