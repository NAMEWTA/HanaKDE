/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AgentFileChangeHistoryAction } from '../AgentFileChangeHistoryAction';

const state = vi.hoisted(() => ({
  currentSessionId: 'sess_current',
  currentSessionPath: '/sessions/current.jsonl',
  sessions: [],
  sessionLocatorsById: {},
  knowledgeSessionEpoch: 7,
  agentActivitiesBySession: {},
}));

vi.mock('../../../stores', () => ({
  useStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

vi.mock('../../file-history/FileHistoryModal', () => ({
  FileHistoryEntryButton: ({ preselectRelPath }: { preselectRelPath?: string | null }) => (
    <button data-testid="file-history-entry" data-history-source="main" type="button">
      {preselectRelPath}
    </button>
  ),
}));

const OPERATION_ID = 'f5bb9a31-3dc0-4d85-b0c7-e7bdf65ee2f8';
const activity = {
  id: 'activity-current',
  kind: 'workflow' as const,
  status: 'done' as const,
  sessionId: 'sess_current',
  sessionPath: '/sessions/current.jsonl',
  agentId: 'agent-a',
  agentName: 'Agent A',
  summary: 'updated plan',
  startedAt: 1,
  finishedAt: 2,
  operationId: OPERATION_ID,
  historyScopeGeneration: 7,
};

function fact(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'sess_current',
    operationId: OPERATION_ID,
    resource: { sourceKey: 'main', relativePath: 'notes/plan.md' },
    ...overrides,
  };
}

describe('AgentFileChangeHistoryAction', () => {
  beforeEach(() => {
    Object.assign(state, {
      currentSessionId: 'sess_current',
      currentSessionPath: '/sessions/current.jsonl',
      knowledgeSessionEpoch: 7,
      agentActivitiesBySession: { sess_current: [activity] },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('reuses the main History entry only after conversation, operation, and scope proof', () => {
    render(
      <AgentFileChangeHistoryAction
        fact={fact()}
        sessionPath="/sessions/current.jsonl"
      />,
    );

    expect(screen.getByTestId('agent-file-change-history')).toHaveAttribute(
      'data-agent-file-impact',
      'main',
    );
    expect(screen.getByTestId('file-history-entry')).toHaveTextContent('notes/plan.md');
  });

  it('does not add a History action for mounted resources or a stale workspace scope', () => {
    const mounted = render(
      <AgentFileChangeHistoryAction
        fact={fact({ resource: { sourceKey: 'mount-project', relativePath: 'notes/plan.md' } })}
        sessionPath="/sessions/current.jsonl"
      />,
    );
    expect(screen.queryByTestId('file-history-entry')).toBeNull();

    mounted.unmount();
    state.knowledgeSessionEpoch = 8;
    render(
      <AgentFileChangeHistoryAction
        fact={fact()}
        sessionPath="/sessions/current.jsonl"
      />,
    );
    expect(screen.queryByTestId('file-history-entry')).toBeNull();
  });
});
