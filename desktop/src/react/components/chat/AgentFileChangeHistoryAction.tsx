import { memo, useMemo } from 'react';
import { FileHistoryEntryButton } from '../file-history/FileHistoryModal';
import { useStore } from '../../stores';
import {
  agentActivityOperationCorrelations,
  selectAgentActivities,
} from '../../stores/agent-activity-slice';
import { sessionIdForPathFromLocatorState } from '../../stores/session-slice';
import { projectAgentFileChangeFact } from '../../../../../shared/workspace-history.ts';
import styles from './Chat.module.css';

/**
 * A renderer-only bridge from an already rendered Agent file block to the
 * main-owned History command. It has no capture, watcher, or write authority.
 */
export const AgentFileChangeHistoryAction = memo(function AgentFileChangeHistoryAction({
  fact,
  sessionPath,
}: {
  fact: unknown;
  sessionPath: string;
}) {
  const sessionId = useStore((state) => (
    sessionIdForPathFromLocatorState(state, sessionPath)
  ));
  const scopeGeneration = useStore((state) => state.knowledgeSessionEpoch);
  const selectActivities = useMemo(
    () => selectAgentActivities(sessionPath),
    [sessionPath],
  );
  const activities = useStore(selectActivities);
  const operationCorrelations = useMemo(
    () => agentActivityOperationCorrelations(activities),
    [activities],
  );
  const projection = useMemo(
    () => projectAgentFileChangeFact(fact, {
      sessionId,
      scopeGeneration,
      operationCorrelations,
    }),
    [fact, operationCorrelations, scopeGeneration, sessionId],
  );

  if (projection?.kind !== 'main-history') return null;

  return (
    <div
      className={styles.agentFileChangeHistoryAction}
      data-agent-file-impact="main"
      data-testid="agent-file-change-history"
    >
      <FileHistoryEntryButton preselectRelPath={projection.resource.relativePath} />
    </div>
  );
});
