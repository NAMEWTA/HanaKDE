import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { KnowledgeResourceAddress, KnowledgeSourceDto } from '../../../../../shared/knowledge-workspace-contract';
import { isKnowledgeTrashEntryExpired } from '../../../../../lib/knowledge-workspace/knowledge-trash-manifest';
import type { KnowledgeWorkspaceClient } from '../../services/knowledge-workspace-client';
import { invokeKnowledgeNativeGrant } from '../../services/knowledge-native-client';
import styles from './KnowledgeWorkspace.module.css';

const tr = (key: string) => window.t?.(key) ?? key;
type TrashEntry = {
  entryId: string;
  originalAddress: KnowledgeResourceAddress;
  trashAddress: KnowledgeResourceAddress;
  deletedAt: string;
  state: string;
  errorCode?: string;
};
type TrashBatch = { batchId: string; sourceKey: string; deletedAt: string; entries: TrashEntry[] };

function batchKey(batch: TrashBatch): string {
  return `${batch.sourceKey}:${batch.batchId}`;
}

function trashEntryKey(entry: TrashEntry): string {
  return `${entry.trashAddress.sourceKey}:${entry.trashAddress.relativePath}`;
}

function preserveConfirmedCleanups(batches: TrashBatch[], confirmedCleanups: ReadonlySet<string>): TrashBatch[] {
  if (confirmedCleanups.size === 0) return batches;
  return batches.map(batch => ({
    ...batch,
    entries: batch.entries.map(entry => (
      confirmedCleanups.has(trashEntryKey(entry))
        ? { ...entry, state: 'cleaned', errorCode: undefined }
        : entry
    )),
  }));
}

export function KnowledgeTrashView({ client, sources, open, onClose, systemTrashAvailable = false, now = Date.now }: {
  client: KnowledgeWorkspaceClient;
  sources: KnowledgeSourceDto[];
  open: boolean;
  onClose(): void;
  systemTrashAvailable?: boolean;
  now?: () => number;
}) {
  const cleanupTitleId = useId();
  const cleanupDescriptionId = useId();
  const [batches, setBatches] = useState<TrashBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<{ batch: string; ids: Set<string> } | null>(null);
  const [cleanupRequest, setCleanupRequest] = useState<{ entries: TrashEntry[] } | null>(null);
  const refresh = useCallback(async (confirmedCleanups: ReadonlySet<string> = new Set()) => {
    setLoading(true);
    setError(false);
    try {
      const all = await Promise.all(sources.map(source => client.listTrash(source.sourceKey)));
      const nextBatches = all.flat().filter((batch): batch is TrashBatch => (
        typeof batch.batchId === 'string' && typeof batch.sourceKey === 'string' && Array.isArray(batch.entries)
      ));
      // A successful native call follows the server-side terminal receipt.
      // The trash listing may nevertheless be one watcher cycle behind, so do
      // not let that stale read resurrect a just-confirmed cleanup in this UI.
      setBatches(preserveConfirmedCleanups(nextBatches, confirmedCleanups));
      return true;
    } catch {
      setError(true);
      return false;
    } finally { setLoading(false); }
  }, [client, sources]);
  useEffect(() => { if (open) void refresh(); }, [open, refresh]);
  const expiredEntries = useMemo(() => batches.flatMap(batch => batch.entries.filter(entry => (
    entry.state === 'trashed' && isKnowledgeTrashEntryExpired(entry as never, now())
  ))), [batches, now]);
  const cleanupEntries = useCallback(async (entries: readonly TrashEntry[]) => {
    setBusy(true);
    setError(false);
    let failed = false;
    const cleaned = new Set<string>();
    for (const entry of entries) {
      try {
        await invokeKnowledgeNativeGrant(client, 'systemTrash', entry.trashAddress);
        // Native success is returned only after Main has recorded the
        // terminal server-side receipt. Keep that committed state visible
        // even if the best-effort list refresh immediately afterwards hits
        // a transient transport or watcher failure.
        cleaned.add(trashEntryKey(entry));
      } catch {
        failed = true;
      }
    }
    if (cleaned.size > 0) {
      setBatches(current => current.map(batch => ({
        ...batch,
        entries: batch.entries.map(entry => (
          cleaned.has(trashEntryKey(entry))
            ? { ...entry, state: 'cleaned', errorCode: undefined }
            : entry
        )),
      })));
    }
    const refreshed = await refresh(cleaned);
    setSelection(null);
    setBusy(false);
    setError(failed || !refreshed);
  }, [client, refresh]);
  if (!open) return null;
  return (
    <>
      <aside aria-label={tr('knowledge.trash.title')} className={styles.trashView}>
        <header>
          <h2>{tr('knowledge.trash.title')}</h2>
          <button onClick={onClose} type="button" aria-label={tr('knowledge.action.close')}>×</button>
        </header>
        <div className={styles.trashToolbar}>
          <button
            disabled={!systemTrashAvailable || busy || expiredEntries.length === 0}
            onClick={() => setCleanupRequest({ entries: expiredEntries })}
            type="button"
          >{tr('knowledge.trash.cleanupExpired')}</button>
        </div>
        {loading && <p role="status">{tr('knowledge.trash.loading')}</p>}
        {error && <p role="alert">{tr('knowledge.trash.operationError')}</p>}
        {!loading && batches.length === 0 && <p>{tr('knowledge.trash.empty')}</p>}
        {batches.map(batch => {
          const key = batchKey(batch);
          const entries = batch.entries.filter(entry => entry.state === 'trashed');
          const selected = selection?.batch === key ? selection.ids : new Set<string>();
          const failedEntries = entries.filter(entry => entry.errorCode);
          return (
            <section key={key}>
              <h3>{sources.find(source => source.sourceKey === batch.sourceKey)?.displayName ?? batch.sourceKey} · {new Date(batch.deletedAt).toLocaleString()}</h3>
              <div className={styles.trashBatchActions}>
                <button
                  disabled={!systemTrashAvailable || busy || selected.size === 0}
                  onClick={() => setCleanupRequest({ entries: entries.filter(entry => selected.has(entry.entryId)) })}
                  type="button"
                >{tr('knowledge.trash.cleanupSelected')}</button>
                <button
                  disabled={!systemTrashAvailable || busy || entries.length === 0}
                  onClick={() => setCleanupRequest({ entries })}
                  type="button"
                >{tr('knowledge.trash.cleanupBatch')}</button>
                {failedEntries.length > 0 && (
                  <button
                    disabled={!systemTrashAvailable || busy}
                    onClick={() => setCleanupRequest({ entries: failedEntries })}
                    type="button"
                  >{tr('knowledge.trash.retryFailed')}</button>
                )}
              </div>
              <ul>
                {entries.map(entry => (
                  <li key={entry.entryId}>
                    <input
                      aria-label={`${tr('knowledge.trash.select')} ${entry.originalAddress.relativePath}`}
                      checked={selected.has(entry.entryId)}
                      disabled={busy}
                      onChange={(event) => {
                        const ids = selection?.batch === key ? new Set(selection.ids) : new Set<string>();
                        if (event.currentTarget.checked) ids.add(entry.entryId);
                        else ids.delete(entry.entryId);
                        setSelection(ids.size > 0 ? { batch: key, ids } : null);
                      }}
                      type="checkbox"
                    />
                    <span>{entry.originalAddress.relativePath}</span>
                    <button type="button" disabled={busy} onClick={async () => {
                      try {
                        const result = await client.restoreTrash(batch.sourceKey, batch.batchId, [entry.entryId]);
                        if (result.some(item => item.ok !== true)) throw new Error('restore failed');
                        await refresh();
                      } catch { setError(true); }
                    }}>{tr('knowledge.action.restore')}</button>
                    <button
                      type="button"
                      disabled={!systemTrashAvailable || busy}
                      onClick={() => setCleanupRequest({ entries: [entry] })}
                    >{tr('knowledge.action.systemTrash')}</button>
                    {entry.errorCode && <small className={styles.trashEntryError} role="alert">{entry.errorCode}</small>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </aside>
      {cleanupRequest && (
        <div className={styles.modalBackdrop} role="presentation">
          <div
            aria-describedby={cleanupDescriptionId}
            aria-labelledby={cleanupTitleId}
            aria-modal="true"
            className={styles.resourceDialog}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !busy) setCleanupRequest(null);
            }}
            role="dialog"
          >
            <h2 id={cleanupTitleId}>{tr('knowledge.trash.cleanupTitle')}</h2>
            <p id={cleanupDescriptionId}>{tr('knowledge.trash.cleanupDescription')}</p>
            <div className={styles.dialogActions}>
              <button autoFocus disabled={busy} onClick={() => setCleanupRequest(null)} type="button">{tr('knowledge.action.cancel')}</button>
              <button disabled={busy} onClick={async () => {
                const entries = cleanupRequest.entries;
                setCleanupRequest(null);
                await cleanupEntries(entries);
              }} type="button">{tr('knowledge.action.systemTrash')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
