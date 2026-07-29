import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  parseKnowledgeResourceAddress,
  type KnowledgeResourceAddress,
  type KnowledgeSourceDto,
} from '../../../../../shared/knowledge-workspace-contract.ts';
import styles from './KnowledgeWorkspace.module.css';

export interface UnsavedDialogDocument {
  address: KnowledgeResourceAddress;
  sourceName: string;
  orphan: boolean;
}

export interface UnsavedDocumentsDialogProps {
  document: UnsavedDialogDocument;
  writableSources: readonly KnowledgeSourceDto[];
  busy?: boolean;
  error?: 'conflict' | 'unavailable' | null;
  onSave(target?: {
    address: KnowledgeResourceAddress;
    sourceName: string;
  }): void;
  onDiscard(): void;
  onCancel(): void;
}

function tr(key: string, vars?: Record<string, string | number>): string {
  return window.t?.(key, vars) ?? key;
}

function defaultTargetPath(address: KnowledgeResourceAddress): string {
  return address.relativePath.toLocaleLowerCase().endsWith('.md')
    ? address.relativePath
    : `${address.relativePath}.md`;
}

export function UnsavedDocumentsDialog({
  document: unsavedDocument,
  writableSources,
  busy = false,
  error = null,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedDocumentsDialogProps) {
  const saveRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [sourceKey, setSourceKey] = useState(
    writableSources[0]?.sourceKey ?? '',
  );
  const [relativePath, setRelativePath] = useState(
    defaultTargetPath(unsavedDocument.address),
  );
  const selectedSource = writableSources.find(
    source => source.sourceKey === sourceKey,
  ) ?? null;
  const target = useMemo(() => {
    if (!unsavedDocument.orphan || !selectedSource) return null;
    const pageName = relativePath.split('/').at(-1) ?? '';
    if (!pageName || pageName.toLocaleLowerCase() === '.md') return null;
    const targetPath = relativePath.toLocaleLowerCase().endsWith('.md')
      ? relativePath
      : `${relativePath}.md`;
    const parsed = parseKnowledgeResourceAddress({
      sourceKey: selectedSource.sourceKey,
      relativePath: targetPath,
    });
    return parsed.ok
      ? {
          address: parsed.value,
          sourceName: selectedSource.displayName,
        }
      : null;
  }, [relativePath, selectedSource, unsavedDocument.orphan]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    saveRef.current?.focus();
    return () => {
      const previous = previousFocusRef.current;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!busy) onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled), input:not(:disabled)',
      ) ?? [],
    );
    if (controls.length === 0) return;
    const currentIndex = controls.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? controls.length - 1 : currentIndex - 1)
      : (currentIndex < 0 || currentIndex === controls.length - 1
          ? 0
          : currentIndex + 1);
    event.preventDefault();
    controls[nextIndex]?.focus();
  };

  const identity = `${unsavedDocument.sourceName} / ${unsavedDocument.address.relativePath}`;
  const saveDisabled = busy || (
    unsavedDocument.orphan
    && (!target || writableSources.length === 0)
  );

  return (
    <div className={styles.unsavedDialogBackdrop} data-knowledge-modal="">
      <div
        ref={dialogRef}
        className={styles.unsavedDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-unsaved-title"
        aria-describedby="knowledge-unsaved-description"
        onKeyDown={handleKeyDown}
      >
        <h2 id="knowledge-unsaved-title">
          {tr('knowledge.unsaved.title')}
        </h2>
        <p id="knowledge-unsaved-description">
          {tr('knowledge.unsaved.description', { document: identity })}
        </p>
        {unsavedDocument.orphan ? (
          <fieldset
            className={styles.unsavedOrphanTarget}
            disabled={busy}
          >
            <legend>{tr('knowledge.unsaved.orphanTarget')}</legend>
            <label>
              <span>{tr('knowledge.unsaved.source')}</span>
              <select
                value={sourceKey}
                onChange={event => setSourceKey(event.currentTarget.value)}
              >
                {writableSources.map(source => (
                  <option value={source.sourceKey} key={source.sourceKey}>
                    {source.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{tr('knowledge.unsaved.relativePath')}</span>
              <input
                value={relativePath}
                onChange={event => setRelativePath(event.currentTarget.value)}
                aria-invalid={relativePath.length > 0 && !target ? 'true' : undefined}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {writableSources.length === 0 ? (
              <p className={styles.unsavedDialogError} role="alert">
                {tr('knowledge.unsaved.noWritableSource')}
              </p>
            ) : null}
          </fieldset>
        ) : null}
        {error ? (
          <p className={styles.unsavedDialogError} role="alert">
            {tr(`knowledge.unsaved.${error}`)}
          </p>
        ) : null}
        <div className={styles.unsavedDialogActions}>
          <button
            ref={saveRef}
            type="button"
            disabled={saveDisabled}
            onClick={() => onSave(target ?? undefined)}
          >
            {busy
              ? tr('knowledge.unsaved.saving')
              : tr('knowledge.unsaved.save')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDiscard}
          >
            {tr('knowledge.unsaved.discard')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            {tr('knowledge.unsaved.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
