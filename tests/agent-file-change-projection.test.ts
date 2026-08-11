import { describe, expect, it } from 'vitest';
import {
  parseAgentFileChangeFact,
  projectAgentFileChangeFact,
} from '../shared/workspace-history.ts';
import {
  agentActivityOperationCorrelations,
  createAgentActivitySlice,
  type AgentActivitySlice,
} from '../desktop/src/react/stores/agent-activity-slice';

const SESSION_ID = 'session-current';
const OPERATION_ID = 'f5bb9a31-3dc0-4d85-b0c7-e7bdf65ee2f8';

function currentScope() {
  return {
    sessionId: SESSION_ID,
    scopeGeneration: 7,
    operationCorrelations: [{ operationId: OPERATION_ID, scopeGeneration: 7 }],
  };
}

function mainFact(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: SESSION_ID,
    operationId: OPERATION_ID,
    resource: { sourceKey: 'main', relativePath: 'notes/plan.md' },
    ...overrides,
  };
}

describe('Agent file-change projection', () => {
  it('projects only a correlated main resource into the shared History entry', () => {
    expect(projectAgentFileChangeFact(mainFact(), currentScope())).toEqual({
      kind: 'main-history',
      operationId: OPERATION_ID,
      resource: { sourceKey: 'main', relativePath: 'notes/plan.md' },
    });
  });

  it('keeps a correlated mounted resource as an Agent operation impact without History authority', () => {
    expect(projectAgentFileChangeFact(mainFact({
      resource: { sourceKey: 'mount-project', relativePath: 'notes/plan.md' },
    }), currentScope())).toEqual({
      kind: 'operation-impact',
      operationId: OPERATION_ID,
      resource: { sourceKey: 'mount-project', relativePath: 'notes/plan.md' },
    });
  });

  it('drops another conversation before considering its operation or resource', () => {
    expect(projectAgentFileChangeFact(mainFact({ sessionId: 'session-other' }), currentScope())).toBeNull();
  });

  it('drops a missing or stale operation correlation instead of guessing from the Agent id', () => {
    expect(projectAgentFileChangeFact(mainFact({
      operationId: 'baf93fd4-a99a-4dbe-bdf2-98dc9c5cc79d',
    }), currentScope())).toBeNull();
    expect(projectAgentFileChangeFact({
      sessionId: SESSION_ID,
      agentId: 'agent-a',
      filePath: '/private/workspace/notes/plan.md',
      resource: { sourceKey: 'main', relativePath: 'notes/plan.md' },
    }, currentScope())).toBeNull();
  });

  it('invalidates a main projection when the renderer scope generation changes', () => {
    expect(projectAgentFileChangeFact(mainFact(), {
      ...currentScope(),
      scopeGeneration: 8,
    })).toBeNull();
  });

  it('rejects raw paths and retains only a validated source-relative address', () => {
    expect(parseAgentFileChangeFact(mainFact({
      resource: { sourceKey: 'main', relativePath: '/private/workspace/notes/plan.md' },
    }))).toBeNull();
    expect(parseAgentFileChangeFact({
      ...mainFact(),
      filePath: '/private/workspace/notes/plan.md',
    })).toBeNull();
    expect(parseAgentFileChangeFact({
      ...mainFact(),
      agentId: 'agent-private',
    })).toBeNull();
  });

  it('uses only locally scoped UUID activity operations as correlation proof', () => {
    expect(agentActivityOperationCorrelations([
      {
        id: 'activity-current',
        kind: 'workflow',
        status: 'done',
        sessionPath: '/sessions/current.jsonl',
        childSessionPath: null,
        agentId: 'agent-a',
        agentName: 'Agent A',
        summary: 'updated plan',
        startedAt: 1,
        finishedAt: 2,
        operationId: OPERATION_ID,
        historyScopeGeneration: 7,
      },
      {
        id: 'activity-invalid-operation',
        kind: 'workflow',
        status: 'done',
        sessionPath: '/sessions/current.jsonl',
        childSessionPath: null,
        agentId: 'agent-a',
        agentName: 'Agent A',
        summary: 'untrusted correlation',
        startedAt: 1,
        finishedAt: 2,
        operationId: 'agent-a',
        historyScopeGeneration: 7,
      },
      {
        id: 'activity-no-scope',
        kind: 'workflow',
        status: 'done',
        sessionPath: '/sessions/current.jsonl',
        childSessionPath: null,
        agentId: 'agent-a',
        agentName: 'Agent A',
        summary: 'missing local scope',
        startedAt: 1,
        finishedAt: 2,
        operationId: 'baf93fd4-a99a-4dbe-bdf2-98dc9c5cc79d',
      },
    ])).toEqual([{ operationId: OPERATION_ID, scopeGeneration: 7 }]);
  });

  it('stamps a valid activity with the local scope and cannot be overwritten by its payload', () => {
    const state = { knowledgeSessionEpoch: 7 } as AgentActivitySlice & {
      knowledgeSessionEpoch: number;
    };
    Object.assign(state, createAgentActivitySlice((partial) => {
      Object.assign(state, typeof partial === 'function' ? partial(state) : partial);
    }));
    const entry = {
      id: 'activity-local-stamp',
      kind: 'workflow' as const,
      status: 'running' as const,
      sessionId: SESSION_ID,
      sessionPath: '/sessions/current.jsonl',
      childSessionPath: null,
      agentId: 'agent-a',
      agentName: 'Agent A',
      summary: 'updated plan',
      startedAt: 1,
      finishedAt: null,
      operationId: OPERATION_ID,
      historyScopeGeneration: 99,
    };

    state.upsertAgentActivity(entry);
    let stored = state.agentActivitiesBySession[SESSION_ID][0];
    expect(stored.historyScopeGeneration).toBe(7);

    state.knowledgeSessionEpoch = 8;
    state.upsertAgentActivity({ ...entry, status: 'done', historyScopeGeneration: 8 });
    stored = state.agentActivitiesBySession[SESSION_ID][0];
    expect(stored.historyScopeGeneration).toBe(7);
    expect(stored.status).toBe('done');
  });
});
