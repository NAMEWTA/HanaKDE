import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Overlay } from '../../ui';
import { useI18n } from '../../hooks/use-i18n';
import { useStore } from '../../stores';
import {
  fetchHistoryCurrent,
  fetchHistoryFiles,
  fetchHistorySnapshot,
  fetchHistoryVersions,
  healthFromHistoryError,
  restoreHistorySnapshot,
  type FileHistoryCurrentContent,
  type FileHistoryExpectedVersion,
  type FileHistoryFileEntry,
  type FileHistoryHealth,
  type FileHistorySnapshotContent,
  type FileHistoryVersionEntry,
} from '../../utils/file-history-api';
import { diffLines, type DiffLine } from '../../utils/line-diff';
import styles from './FileHistoryModal.module.css';

type ModalStatus = 'idle' | 'loading' | 'ready' | 'restoring' | 'restored' | 'conflict' | 'error';

function isAbortError(error: unknown): boolean {
  return (
    (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
    || (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
  );
}

function translated(t: (key: string, vars?: Record<string, string | number>) => string, key: string, fallback: string): string {
  const value = t(key);
  return value === key ? fallback : value;
}

function originLabel(
  t: (key: string, vars?: Record<string, string | number>) => string,
  origin: FileHistoryVersionEntry['origin'],
): string {
  const key = origin === 'baseline' ? 'sweep' : origin;
  return t(`fileHistory.origin.${key}`);
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return 'history_error';
}

function historyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3.5 4.5v4h4" />
      <path d="M12 7.5v5l3 2" />
    </svg>
  );
}

function closeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function retryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8 8 0 0 0-14.7-4L3 9" />
      <path d="M3 4v5h5" />
      <path d="M4 13a8 8 0 0 0 14.7 4L21 15" />
      <path d="M21 20v-5h-5" />
    </svg>
  );
}

/** A host-facing main-only History command/menu item. */
export function FileHistoryEntryButton({ preselectRelPath = null }: { preselectRelPath?: string | null }) {
  const { t } = useI18n();
  const open = useStore(s => s.openFileHistoryModal);
  const label = t('preview.fileHistory');
  return (
    <button
      type="button"
      className={styles.entryButton}
      aria-label={label}
      title={label}
      data-testid="file-history-entry"
      data-history-source="main"
      onClick={() => open(preselectRelPath)}
    >
      {historyIcon()}
      <span>{label}</span>
    </button>
  );
}

export function FileHistoryModal() {
  const { t } = useI18n();
  const modal = useStore(s => s.fileHistoryModal);
  const close = useStore(s => s.closeFileHistoryModal);
  const [files, setFiles] = useState<FileHistoryFileEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [versions, setVersions] = useState<FileHistoryVersionEntry[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<FileHistorySnapshotContent | null>(null);
  const [current, setCurrent] = useState<FileHistoryCurrentContent | null>(null);
  const [status, setStatus] = useState<ModalStatus>('idle');
  const [health, setHealth] = useState<FileHistoryHealth>('RECONCILING');
  const [failureCode, setFailureCode] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const scopeRef = useRef(modal.scopeGeneration ?? 0);
  scopeRef.current = modal.scopeGeneration ?? 0;

  useEffect(() => {
    if (!modal.open) {
      setFiles([]);
      setSelectedPath(null);
      setVersions([]);
      setSelectedVersion(null);
      setSnapshot(null);
      setCurrent(null);
      setStatus('idle');
      setHealth('RECONCILING');
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setStatus('loading');
    setHealth('RECONCILING');
    setFailureCode(null);
    setFiles([]);
    setVersions([]);
    setSelectedVersion(null);
    setSnapshot(null);
    setCurrent(null);

    void fetchHistoryFiles({ signal: controller.signal })
      .then((nextFiles) => {
        if (!active || controller.signal.aborted) return;
        setFiles(nextFiles);
        setHealth('HEALTHY');
        setStatus('ready');
        const requested = modal.preselectRelPath;
        const first = nextFiles.find(file => file.relPath === requested)
          || nextFiles.find(file => file.deletedAt == null)
          || nextFiles[0]
          || null;
        setSelectedPath(first?.relPath ?? null);
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted || isAbortError(error)) return;
        setHealth(healthFromHistoryError(error));
        setFailureCode(errorCode(error));
        setStatus('error');
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [modal.open, modal.preselectRelPath, modal.scopeGeneration, retryNonce]);

  useEffect(() => {
    if (!modal.open || !selectedPath) {
      setVersions([]);
      setSelectedVersion(null);
      setSnapshot(null);
      setCurrent(null);
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setStatus('loading');
    setFailureCode(null);
    setVersions([]);
    setSelectedVersion(null);
    setSnapshot(null);
    setCurrent(null);
    void fetchHistoryVersions(selectedPath, { signal: controller.signal })
      .then((nextVersions) => {
        if (!active || controller.signal.aborted) return;
        setVersions(nextVersions);
        setSelectedVersion(nextVersions[0]?.id ?? null);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted || isAbortError(error)) return;
        setHealth(healthFromHistoryError(error));
        setFailureCode(errorCode(error));
        setStatus('error');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [modal.open, modal.scopeGeneration, selectedPath]);

  useEffect(() => {
    if (!modal.open || !selectedPath || selectedVersion == null) {
      setSnapshot(null);
      setCurrent(null);
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setStatus('loading');
    setFailureCode(null);
    const selectedFile = files.find(file => file.relPath === selectedPath);
    const currentPromise = selectedFile?.deletedAt != null
      ? Promise.resolve<FileHistoryCurrentContent | null>(null)
      : fetchHistoryCurrent(selectedPath, { signal: controller.signal }).catch((error: unknown) => {
        if (error && typeof error === 'object' && 'status' in error && error.status === 404) return null;
        throw error;
      });

    void Promise.all([
      fetchHistorySnapshot(selectedPath, selectedVersion, versions, { signal: controller.signal }),
      currentPromise,
    ])
      .then(([nextSnapshot, nextCurrent]) => {
        if (!active || controller.signal.aborted) return;
        setSnapshot(nextSnapshot);
        setCurrent(nextCurrent);
        setHealth('HEALTHY');
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted || isAbortError(error)) return;
        setHealth(healthFromHistoryError(error));
        setFailureCode(errorCode(error));
        setStatus('error');
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [files, modal.open, modal.scopeGeneration, selectedPath, selectedVersion, versions]);

  const visibleFiles = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    if (!query) return files;
    return files.filter(file => file.relPath.toLocaleLowerCase().includes(query));
  }, [files, filter]);
  const activeFiles = visibleFiles.filter(file => file.deletedAt == null);
  const deletedFiles = visibleFiles.filter(file => file.deletedAt != null);
  const orderedFiles = useMemo(() => [...activeFiles, ...deletedFiles], [activeFiles, deletedFiles]);

  const diff: DiffLine[] | null = useMemo(() => {
    if (!snapshot) return null;
    return diffLines(current?.content ?? '', snapshot.content);
  }, [current?.content, snapshot]);

  const selectAdjacentFile = useCallback((path: string, direction: 1 | -1) => {
    const index = orderedFiles.findIndex(file => file.relPath === path);
    if (index < 0 || orderedFiles.length === 0) return;
    const next = orderedFiles[(index + direction + orderedFiles.length) % orderedFiles.length];
    setSelectedPath(next.relPath);
  }, [orderedFiles]);

  const handleFileKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, path: string) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      selectAdjacentFile(path, 1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      selectAdjacentFile(path, -1);
    }
  }, [selectAdjacentFile]);

  const handleRetry = useCallback(() => {
    setRetryNonce(value => value + 1);
  }, []);

  const handleRestore = useCallback(async () => {
    if (!selectedPath || !snapshot || status === 'restoring' || health === 'FAILED') return;
    const controller = new AbortController();
    const scopeGeneration = modal.scopeGeneration ?? 0;
    setStatus('restoring');
    setFailureCode(null);
    try {
      // Re-read immediately before effect to preserve T-15's expected-version
      // preflight. A deleted entry intentionally uses null to create it.
      const selectedFile = files.find(file => file.relPath === selectedPath);
      const latestCurrent = selectedFile?.deletedAt != null
        ? null
        : await fetchHistoryCurrent(selectedPath, { signal: controller.signal });
      if (scopeRef.current !== scopeGeneration || controller.signal.aborted) return;
      const expectedVersion: FileHistoryExpectedVersion | null = latestCurrent?.version ?? null;
      const result = await restoreHistorySnapshot(
        selectedPath,
        snapshot.content,
        expectedVersion,
        { signal: controller.signal },
      );
      if (scopeRef.current !== scopeGeneration || controller.signal.aborted) return;
      if (result.ok === false) {
        setStatus('conflict');
        setFailureCode('resource_conflict');
        setCurrent(latestCurrent);
        return;
      }
      setStatus('restored');
      setHealth('HEALTHY');
      setCurrent(latestCurrent);
      setRetryNonce(value => value + 1);
    } catch (error: unknown) {
      if (scopeRef.current !== scopeGeneration || controller.signal.aborted || isAbortError(error)) return;
      setHealth(healthFromHistoryError(error));
      setFailureCode(errorCode(error));
      setStatus('error');
    } finally {
      controller.abort();
    }
  }, [files, health, modal.scopeGeneration, selectedPath, snapshot, status]);

  const healthText = health === 'HEALTHY'
    ? translated(t, 'fileHistory.restoreDone', 'Ready')
    : translated(t, 'fileHistory.error', 'History unavailable');
  const statusText = status === 'restored'
    ? t('fileHistory.restoreDone')
    : status === 'conflict'
      ? translated(t, 'fileHistory.error', 'Resource changed before restore')
      : status === 'error'
        ? t('fileHistory.error')
        : null;

  return (
    <Overlay
      scope="inline"
      open={modal.open}
      onClose={close}
      backdrop="blur"
      className={styles.modal}
      disableContainerAnimation
      contentProps={{
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'file-history-title',
        'aria-describedby': 'file-history-description',
        'data-history-source': 'main',
      }}
    >
      <div className={styles.header}>
        <div>
          <h2 id="file-history-title" className={styles.title}>{t('fileHistory.title')}</h2>
          <p id="file-history-description" className={styles.description}>{t('fileHistory.selectVersion')}</p>
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={close}
          aria-label={translated(t, 'common.close', 'Close')}
          title={translated(t, 'common.close', 'Close')}
        >
          {closeIcon()}
        </button>
      </div>

      <div className={styles.healthBar} data-health={health} role="status" aria-live="polite">
        <span className={styles.healthDot} aria-hidden="true" />
        <span>{healthText}</span>
        {(health === 'FAILED' || health === 'DEGRADED') && (
          <button type="button" className={styles.retryBtn} onClick={handleRetry}>
            {retryIcon()}
            <span>{t('action.retry')}</span>
          </button>
        )}
      </div>

      <div className={styles.body}>
        <section className={styles.fileList} aria-labelledby="file-history-files-heading">
          <h3 id="file-history-files-heading" className={styles.sectionHeading}>{t('fileHistory.title')}</h3>
          <input
            className={styles.search}
            value={filter}
            onChange={event => setFilter(event.target.value)}
            placeholder={t('fileHistory.searchPlaceholder')}
            aria-label={t('fileHistory.searchPlaceholder')}
          />
          {activeFiles.map(file => (
            <button
              key={file.relPath}
              type="button"
              className={`${styles.fileRow}${selectedPath === file.relPath ? ` ${styles.fileRowActive}` : ''}`}
              aria-current={selectedPath === file.relPath ? 'true' : undefined}
              onClick={() => setSelectedPath(file.relPath)}
              onKeyDown={event => handleFileKeyDown(event, file.relPath)}
            >
              {file.relPath}
            </button>
          ))}
          {deletedFiles.length > 0 && (
            <div className={styles.deletedGroup}>
              <div className={styles.groupLabel} data-testid="file-history-deleted-group">{t('fileHistory.deletedGroup')}</div>
              {deletedFiles.map(file => (
                <button
                  key={file.relPath}
                  type="button"
                  className={`${styles.fileRow} ${styles.fileRowDeleted}${selectedPath === file.relPath ? ` ${styles.fileRowActive}` : ''}`}
                  aria-current={selectedPath === file.relPath ? 'true' : undefined}
                  onClick={() => setSelectedPath(file.relPath)}
                  onKeyDown={event => handleFileKeyDown(event, file.relPath)}
                >
                  {file.relPath}
                </button>
              ))}
            </div>
          )}
          {files.length === 0 && status !== 'loading' && (
            <div className={styles.empty}>{t('fileHistory.empty')}</div>
          )}
        </section>

        <section className={styles.timeline} aria-labelledby="file-history-timeline-heading">
          <h3 id="file-history-timeline-heading" className={styles.sectionHeading}>{t('fileHistory.title')}</h3>
          {versions.map(version => (
            <button
              key={version.id}
              type="button"
              data-testid={`fh-version-${version.id}`}
              className={`${styles.versionRow}${selectedVersion === version.id ? ` ${styles.versionRowActive}` : ''}`}
              aria-current={selectedVersion === version.id ? 'true' : undefined}
              onClick={() => setSelectedVersion(version.id)}
            >
              <span className={styles.versionTime}>{new Date(version.capturedAt).toLocaleString()}</span>
              <span className={styles.versionOrigin}>{originLabel(t, version.origin)}</span>
            </button>
          ))}
          {selectedPath && versions.length === 0 && status !== 'loading' && (
            <div className={styles.empty}>{t('fileHistory.noVersions')}</div>
          )}
        </section>

        <section className={styles.diffPane} aria-labelledby="file-history-diff-heading">
          <h3 id="file-history-diff-heading" className={styles.sectionHeading}>{t('fileHistory.selectVersion')}</h3>
          <pre className={styles.diff} tabIndex={0} aria-label={t('fileHistory.selectVersion')}>
            {diff
              ? diff.map((line, index) => (
                <span key={`${line.kind}-${index}`} className={
                  line.kind === 'added' ? styles.lineAdded
                    : line.kind === 'removed' ? styles.lineRemoved
                      : styles.lineSame
                }>{line.text || ' '}{'\n'}</span>
              ))
              : <span className={styles.empty}>{status === 'loading' ? t('fileHistory.selectVersion') : t('fileHistory.selectVersion')}</span>}
          </pre>
          <div className={styles.actions}>
            {statusText && (
              <span
                className={status === 'conflict' || status === 'error' ? styles.errorNote : styles.restoredNote}
                data-testid="fh-result"
                data-result={status}
                data-error-code={failureCode ?? undefined}
              >
                {statusText}
              </span>
            )}
            <button
              type="button"
              data-testid="fh-restore"
              className={styles.restoreBtn}
              disabled={selectedVersion == null || snapshot == null || status === 'restoring' || health === 'FAILED'}
              onClick={() => { void handleRestore(); }}
            >
              {t('fileHistory.restore')}
            </button>
          </div>
        </section>
      </div>
    </Overlay>
  );
}
