import { useEffect, useId, useState } from 'react';
import type { KnowledgeWorkspaceClient } from '../../services/knowledge-workspace-client';
import type { KnowledgeResourceAddress } from '../../../../../shared/knowledge-workspace-contract';
import styles from './KnowledgeWorkspace.module.css';

const tr = (key: string) => window.t?.(key) ?? key;

export function CreateResourceDialog({
  client,
  kind,
  sourceKey,
  directoryPath,
  onClose,
  onCreated,
}: {
  client: KnowledgeWorkspaceClient;
  kind: 'page' | 'folder' | null;
  sourceKey: string | null;
  directoryPath: string;
  onClose(): void;
  onCreated(result: { kind: 'page' | 'folder'; address: KnowledgeResourceAddress }): void;
}) {
  const labelId = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { setName(''); setError(null); }, [kind, sourceKey, directoryPath]);
  if (!kind || !sourceKey) return null;
  const title = tr(kind === 'page' ? 'knowledge.create.pageTitle' : 'knowledge.create.folderTitle');
  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form
        aria-labelledby={labelId}
        className={styles.resourceDialog}
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          setError(null);
          try {
            const result = await client.createResource({ kind, sourceKey, directoryPath, name });
            onCreated(result);
            onClose();
          } catch (cause) {
            setError((cause as { code?: string })?.code ?? 'knowledge_operation_precondition_failed');
          } finally {
            setSubmitting(false);
          }
        }}
        role="dialog"
        aria-modal="true"
      >
        <h2 id={labelId}>{title}</h2>
        <label>
          <span>{tr('knowledge.create.name')}</span>
          <input autoFocus maxLength={255} onChange={(event) => setName(event.target.value)} value={name} />
        </label>
        {error && <p role="alert">{tr('knowledge.create.error')}</p>}
        <div className={styles.dialogActions}>
          <button type="button" onClick={onClose}>{tr('knowledge.action.cancel')}</button>
          <button disabled={submitting || !name.trim()} type="submit">{tr('knowledge.action.create')}</button>
        </div>
      </form>
    </div>
  );
}
