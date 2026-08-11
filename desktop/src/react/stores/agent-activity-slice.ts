/**
 * agent-activity-slice.ts — Agent Activity 实时活动（后台任务）
 *
 * 消费后端 ActivityHub 广播的 agent_activity 事件。entry 自带 sessionId + sessionPath；
 * store 内部按 sessionId/scoped key 分桶，sessionPath 只作为实时流 locator 和旧数据兼容键。
 */

import { sessionScopedKey, sessionScopedValue, type SessionLocatorState } from './session-slice';
import { isOperationCorrelationId } from '../../../../shared/knowledge-diagnostics.ts';
import {
  isAgentFileChangeScopeGeneration,
  type AgentActivityOperationCorrelation,
} from '../../../../shared/workspace-history.ts';

export interface AgentActivityEntry {
  id: string;
  kind: 'subagent' | 'workflow' | 'workflow_agent' | 'workflow_step' | 'heartbeat' | 'cron' | 'agent_tool';
  status: 'running' | 'done' | 'failed' | 'aborted';
  sessionId?: string | null;
  sessionPath: string | null;
  agentId: string | null;
  agentName: string | null;
  summary: string | null;
  childSessionId?: string | null;
  childSessionPath: string | null;
  threadId?: string | null;
  threadKind?: string | null;
  access?: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  // workflow_agent 子节点和 subagent 都会用 label：节点名或子 Agent 展示标签。
  parentTaskId?: string | null;
  label?: string | null;
  phaseLabel?: string | null;
  tokens?: number | null;
  stepKind?: 'parallel' | 'pipeline' | 'log' | null;
  /** Opaque ResourceIO operation correlation emitted by a future activity source. */
  operationId?: string | null;
  /** Renderer-local workspace lifetime captured on first valid activity receipt. */
  historyScopeGeneration?: number | null;
}

export interface AgentActivitySlice {
  /** 按 session identity key 存储的活动列表（读旧 path key 兼容） */
  agentActivitiesBySession: Record<string, AgentActivityEntry[]>;
  upsertAgentActivity: (entry: AgentActivityEntry) => void;
  clearAgentActivities: (sessionPath: string) => void;
}

export const createAgentActivitySlice = (
  set: (partial: Partial<AgentActivitySlice> | ((s: AgentActivitySlice) => Partial<AgentActivitySlice>)) => void
): AgentActivitySlice => ({
  agentActivitiesBySession: {},
  upsertAgentActivity: (entry) => {
    // A websocket payload may not select its own History scope. Drop any
    // supplied generation and stamp it only from the renderer state below.
    const received = entry as AgentActivityEntry | null | undefined;
    if (!received) return;
    const incoming = { ...received };
    delete incoming.historyScopeGeneration;
    const sp = incoming.sessionPath;
    if (!sp || !incoming.id) return; // 无归属/无 id 不入库（禁止从焦点 session 兜底）
    set((s) => {
      const state = s as AgentActivitySlice & SessionLocatorState & {
        knowledgeSessionEpoch?: unknown;
      };
      const key = incoming.sessionId?.trim() || sessionScopedKey(state, sp) || sp;
      // An explicit session id is authoritative even before the session
      // locator hydrates. Prefer that bucket so an activity update retains its
      // original local scope stamp instead of being treated as a new record.
      const list = s.agentActivitiesBySession[key]
        || sessionScopedValue(state, s.agentActivitiesBySession, sp)
        || [];
      const idx = list.findIndex((e) => e.id === incoming.id);
      const existing = idx >= 0 ? list[idx] : null;
      const { historyScopeGeneration: existingScopeGeneration, ...existingWithoutScope } = existing || {};
      const nextEntry = {
        ...existingWithoutScope,
        ...incoming,
      } as AgentActivityEntry;
      const scopeGeneration = isOperationCorrelationId(nextEntry.operationId)
        ? (isAgentFileChangeScopeGeneration(existingScopeGeneration)
          ? existingScopeGeneration
          : (isAgentFileChangeScopeGeneration(state.knowledgeSessionEpoch)
            ? state.knowledgeSessionEpoch
            : null))
        : null;
      const scopedEntry: AgentActivityEntry = {
        ...nextEntry,
        ...(scopeGeneration === null ? {} : { historyScopeGeneration: scopeGeneration }),
      };
      const next = idx >= 0
        ? list.map((e) => (e.id === incoming.id ? scopedEntry : e))
        : [...list, scopedEntry];
      const agentActivitiesBySession = { ...s.agentActivitiesBySession, [key]: next };
      if (key !== sp) delete agentActivitiesBySession[sp];
      return { agentActivitiesBySession };
    });
  },
  clearAgentActivities: (sessionPath) => {
    set((s) => {
      const key = sessionScopedKey(s as AgentActivitySlice & SessionLocatorState, sessionPath) || sessionPath;
      if (!s.agentActivitiesBySession[key] && !s.agentActivitiesBySession[sessionPath]) return {};
      const next = { ...s.agentActivitiesBySession };
      delete next[key];
      delete next[sessionPath];
      return { agentActivitiesBySession: next };
    });
  },
});

// ── Selectors ──
const EMPTY: AgentActivityEntry[] = [];
/** 当前对话的活动列表（稳定空引用，避免无活动时触发 re-render） */
export const selectAgentActivities =
  (sessionPath: string | null) =>
  (s: AgentActivitySlice & SessionLocatorState): AgentActivityEntry[] =>
    sessionPath ? (sessionScopedValue(s, s.agentActivitiesBySession, sessionPath) || EMPTY) : EMPTY;

/**
 * Return only operation identities backed by the existing activity records and
 * their locally captured workspace lifetime. This is a projection helper, not
 * an additional activity or History store.
 */
export function agentActivityOperationCorrelations(
  entries: readonly AgentActivityEntry[],
): AgentActivityOperationCorrelation[] {
  const correlations: AgentActivityOperationCorrelation[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (
      !isOperationCorrelationId(entry.operationId)
      || !isAgentFileChangeScopeGeneration(entry.historyScopeGeneration)
    ) {
      continue;
    }
    const key = `${entry.operationId}:${entry.historyScopeGeneration}`;
    if (seen.has(key)) continue;
    seen.add(key);
    correlations.push(Object.freeze({
      operationId: entry.operationId,
      scopeGeneration: entry.historyScopeGeneration,
    }));
  }
  return correlations;
}
