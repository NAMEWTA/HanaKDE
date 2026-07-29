import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { EditorView } from '@codemirror/view';
import {
  activateKnowledgeFindMatch,
  applyKnowledgeFindHighlights,
  chooseKnowledgeFindMatch,
  chooseKnowledgeFindMatchAfter,
  clearKnowledgeFindHighlights,
  findKnowledgeMatches,
  getActiveKnowledgeFindHighlight,
  replaceAllKnowledgeFindMatches,
  replaceKnowledgeFindMatch,
  type KnowledgeFindMatch,
} from '../../editor/knowledge-find-state';
import styles from './KnowledgeWorkspace.module.css';

export type KnowledgeFindCommand = 'find' | 'replace';

export interface KnowledgeFindBarProps {
  editorView: EditorView | null;
  command: KnowledgeFindCommand;
  commandRevision: number;
  documentRevision: number;
  initialQuery: string;
  onClose(): void;
}

function tr(key: string): string {
  return window.t?.(key) ?? key;
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]/gu, '');
}

function Icon({
  kind,
}: {
  kind: 'expand' | 'previous' | 'next' | 'replace' | 'replace-all' | 'close';
}) {
  const path = kind === 'expand'
    ? 'M9 18l6-6-6-6'
    : kind === 'previous'
      ? 'M18 15l-6-6-6 6'
      : kind === 'next'
        ? 'M6 9l6 6 6-6'
        : kind === 'replace'
          ? 'M4 7h11m-3-3 3 3-3 3M20 17H9m3-3-3 3 3 3'
          : kind === 'replace-all'
            ? 'M3 6h8m-2-3 3 3-3 3M21 18h-8m2-3-3 3 3 3M5 12h14'
            : 'M18 6L6 18M6 6l12 12';
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="14"
    >
      <path d={path} />
    </svg>
  );
}

function sameMatch(
  left: KnowledgeFindMatch | null,
  right: KnowledgeFindMatch,
): boolean {
  return Boolean(
    left
    && left.from === right.from
    && left.to === right.to,
  );
}

export function KnowledgeFindBar({
  editorView,
  command,
  commandRevision,
  documentRevision,
  initialQuery,
  onClose,
}: KnowledgeFindBarProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const replacementRef = useRef<HTMLInputElement>(null);
  const activeIndexRef = useRef(-1);
  const previousCriteriaRef = useRef<{
    editorView: EditorView | null;
    query: string;
    caseSensitive: boolean;
    wholeWord: boolean;
  } | null>(null);
  const [query, setQuery] = useState(() => singleLine(initialQuery));
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [expanded, setExpanded] = useState(command === 'replace');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [localDocumentRevision, setLocalDocumentRevision] = useState(0);

  activeIndexRef.current = activeIndex;

  const options = useMemo(() => ({
    query,
    caseSensitive,
    wholeWord,
  }), [caseSensitive, query, wholeWord]);
  const matches = useMemo(() => {
    // EditorView mutates its state behind a stable object identity. Revisions
    // deliberately invalidate this projection after document/selection work.
    void documentRevision;
    void localDocumentRevision;
    return editorView ? findKnowledgeMatches(editorView.state, options) : [];
  }, [
    documentRevision,
    editorView,
    localDocumentRevision,
    options,
  ]);

  const overlayHeight = useCallback(() => (
    panelRef.current?.getBoundingClientRect().height ?? 0
  ), []);

  const selectMatch = useCallback((
    nextIndex: number,
    sourceMatches: readonly KnowledgeFindMatch[] = matches,
  ) => {
    if (!editorView || sourceMatches.length === 0) {
      activeIndexRef.current = -1;
      setActiveIndex(-1);
      if (editorView) applyKnowledgeFindHighlights(editorView, sourceMatches, -1);
      return;
    }
    const normalized = (
      (nextIndex % sourceMatches.length) + sourceMatches.length
    ) % sourceMatches.length;
    activeIndexRef.current = normalized;
    setActiveIndex(normalized);
    applyKnowledgeFindHighlights(editorView, sourceMatches, normalized);
    activateKnowledgeFindMatch(
      editorView,
      sourceMatches[normalized],
      overlayHeight(),
    );
  }, [editorView, matches, overlayHeight]);

  useLayoutEffect(() => {
    if (!editorView) {
      activeIndexRef.current = -1;
      setActiveIndex(-1);
      return;
    }
    const previousCriteria = previousCriteriaRef.current;
    const criteriaChanged = (
      previousCriteria?.editorView !== editorView
      || previousCriteria?.query !== query
      || previousCriteria?.caseSensitive !== caseSensitive
      || previousCriteria?.wholeWord !== wholeWord
    );
    previousCriteriaRef.current = {
      editorView,
      query,
      caseSensitive,
      wholeWord,
    };

    const mappedActive = criteriaChanged
      ? null
      : getActiveKnowledgeFindHighlight(editorView);
    let nextIndex = mappedActive
      ? matches.findIndex(match => sameMatch(mappedActive, match))
      : -1;
    const selection = editorView.state.selection.main;
    if (nextIndex < 0 && !selection.empty) {
      nextIndex = matches.findIndex(match => (
        match.from === selection.from && match.to === selection.to
      ));
    }
    if (nextIndex < 0) {
      nextIndex = chooseKnowledgeFindMatch(
        matches,
        selection.head,
      );
    }
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
    applyKnowledgeFindHighlights(editorView, matches, nextIndex);
    if (criteriaChanged && nextIndex >= 0) {
      activateKnowledgeFindMatch(
        editorView,
        matches[nextIndex],
        overlayHeight(),
      );
    }
  }, [
    caseSensitive,
    editorView,
    matches,
    overlayHeight,
    query,
    wholeWord,
  ]);

  useEffect(() => {
    if (!editorView) return undefined;
    return () => clearKnowledgeFindHighlights(editorView);
  }, [editorView]);

  const focusQuery = useCallback(() => {
    queryRef.current?.focus();
    queryRef.current?.select();
  }, []);

  const focusReplacement = useCallback(() => {
    setExpanded(true);
    window.requestAnimationFrame(() => {
      replacementRef.current?.focus();
      replacementRef.current?.select();
    });
  }, []);

  useEffect(() => {
    if (command === 'replace') focusReplacement();
    else focusQuery();
  }, [command, commandRevision, focusQuery, focusReplacement]);

  const close = useCallback(() => {
    if (editorView) {
      const active = matches[activeIndexRef.current];
      if (active) {
        editorView.dispatch({
          selection: {
            anchor: active.from,
            head: active.to,
          },
        });
      }
      clearKnowledgeFindHighlights(editorView);
    }
    onClose();
    window.requestAnimationFrame(() => editorView?.focus());
  }, [editorView, matches, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (
        event.defaultPrevented
        || !(event.metaKey || event.ctrlKey)
      ) {
        return;
      }
      const key = event.key.toLocaleLowerCase();
      if (key !== 'f' && key !== 'h') return;
      if (!panelRef.current?.contains(event.target as Node | null)) return;
      event.preventDefault();
      event.stopPropagation();
      if (key === 'h') focusReplacement();
      else focusQuery();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, focusQuery, focusReplacement]);

  const replaceCurrent = useCallback(() => {
    if (!editorView || editorView.state.readOnly) return;
    const match = matches[activeIndexRef.current];
    if (!match) return;
    const cursor = replaceKnowledgeFindMatch(editorView, match, replacement);
    const nextMatches = findKnowledgeMatches(editorView.state, options);
    const nextIndex = chooseKnowledgeFindMatchAfter(nextMatches, cursor);
    setLocalDocumentRevision(revision => revision + 1);
    selectMatch(nextIndex, nextMatches);
  }, [editorView, matches, options, replacement, selectMatch]);

  const replaceAll = useCallback(() => {
    if (!editorView || editorView.state.readOnly || matches.length === 0) return;
    replaceAllKnowledgeFindMatches(editorView, matches, replacement);
    const nextMatches = findKnowledgeMatches(editorView.state, options);
    const nextIndex = chooseKnowledgeFindMatch(
      nextMatches,
      editorView.state.selection.main.head,
    );
    setLocalDocumentRevision(revision => revision + 1);
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
    applyKnowledgeFindHighlights(editorView, nextMatches, nextIndex);
  }, [editorView, matches, options, replacement]);

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[data-find-control]')
        ?? [],
    ).filter(control => !control.closest('[hidden]'));
    if (controls.length === 0) return;
    const current = controls.indexOf(
      panelRef.current?.ownerDocument.activeElement as HTMLElement,
    );
    const next = event.shiftKey
      ? (current <= 0 ? controls.length - 1 : current - 1)
      : (current < 0 || current === controls.length - 1 ? 0 : current + 1);
    event.preventDefault();
    controls[next]?.focus();
  };

  const count = matches.length;
  const current = count > 0 && activeIndex >= 0 ? activeIndex + 1 : 0;

  return (
    <div
      ref={panelRef}
      className={styles.knowledgeFindBar}
      role="search"
      aria-label={tr('knowledge.find.label')}
      onKeyDown={trapFocus}
    >
      <button
        className={styles.knowledgeFindIconButton}
        type="button"
        data-find-control=""
        aria-expanded={expanded}
        aria-label={tr(expanded
          ? 'knowledge.find.collapseReplace'
          : 'knowledge.find.expandReplace')}
        onClick={() => {
          if (expanded && replacementRef.current?.contains(
            panelRef.current?.ownerDocument.activeElement ?? null,
          )) {
            queryRef.current?.focus();
          }
          setExpanded(value => !value);
        }}
      >
        <span
          className={styles.knowledgeFindExpandIcon}
          data-expanded={expanded ? 'true' : 'false'}
        >
          <Icon kind="expand" />
        </span>
      </button>
      <input
        ref={queryRef}
        className={styles.knowledgeFindInput}
        type="text"
        data-find-control=""
        aria-label={tr('knowledge.find.query')}
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={event => setQuery(singleLine(event.target.value))}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          selectMatch(activeIndexRef.current + (event.shiftKey ? -1 : 1));
        }}
      />
      <button
        className={styles.knowledgeFindToggle}
        type="button"
        data-find-control=""
        aria-label={tr('knowledge.find.matchCase')}
        aria-pressed={caseSensitive}
        onClick={() => setCaseSensitive(value => !value)}
      >
        Aa
      </button>
      <button
        className={styles.knowledgeFindToggle}
        type="button"
        data-find-control=""
        aria-label={tr('knowledge.find.wholeWord')}
        aria-pressed={wholeWord}
        onClick={() => setWholeWord(value => !value)}
      >
        Ab
      </button>
      <span
        className={styles.knowledgeFindCount}
        aria-live="polite"
      >
        {current} / {count}
      </span>
      <button
        className={styles.knowledgeFindIconButton}
        type="button"
        data-find-control=""
        aria-label={tr('knowledge.find.previous')}
        onClick={() => selectMatch(activeIndexRef.current - 1)}
      >
        <Icon kind="previous" />
      </button>
      <button
        className={styles.knowledgeFindIconButton}
        type="button"
        data-find-control=""
        aria-label={tr('knowledge.find.next')}
        onClick={() => selectMatch(activeIndexRef.current + 1)}
      >
        <Icon kind="next" />
      </button>
      {expanded ? (
        <div className={styles.knowledgeFindReplaceRow}>
          <input
            ref={replacementRef}
            className={styles.knowledgeFindInput}
            type="text"
            data-find-control=""
            aria-label={tr('knowledge.find.replacement')}
            autoComplete="off"
            spellCheck={false}
            value={replacement}
            onChange={event => setReplacement(singleLine(event.target.value))}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              replaceCurrent();
            }}
          />
          <button
            className={styles.knowledgeFindIconButton}
            type="button"
            data-find-control=""
            aria-label={tr('knowledge.find.replace')}
            onClick={replaceCurrent}
          >
            <Icon kind="replace" />
          </button>
          <button
            className={styles.knowledgeFindIconButton}
            type="button"
            data-find-control=""
            aria-label={tr('knowledge.find.replaceAll')}
            onClick={replaceAll}
          >
            <Icon kind="replace-all" />
          </button>
        </div>
      ) : null}
      <button
        className={`${styles.knowledgeFindIconButton} ${styles.knowledgeFindClose}`}
        type="button"
        data-find-control=""
        aria-label={tr('knowledge.find.close')}
        onClick={close}
      >
        <Icon kind="close" />
      </button>
    </div>
  );
}
