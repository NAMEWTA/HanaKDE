// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeSourceDto } from '../../../../../shared/knowledge-workspace-contract.ts';
import { UnsavedDocumentsDialog } from '../../components/knowledge-workspace/UnsavedDocumentsDialog';

const writableSources: KnowledgeSourceDto[] = [{
  sourceKey: 'main',
  displayName: 'Main',
  role: 'main',
  capabilities: ['read', 'write'],
  availability: 'available',
}];

function renderDialog(overrides: Partial<Parameters<
  typeof UnsavedDocumentsDialog
>[0]> = {}) {
  const props: Parameters<typeof UnsavedDocumentsDialog>[0] = {
    document: {
      address: { sourceKey: 'main', relativePath: 'Notes/A.md' },
      sourceName: 'Main',
      orphan: false,
    },
    writableSources,
    onSave: vi.fn(),
    onDiscard: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<UnsavedDocumentsDialog {...props} />) };
}

describe('UnsavedDocumentsDialog', () => {
  beforeEach(() => {
    window.t = ((key: string, vars?: Record<string, string | number>) => (
      vars?.document ? `${key}:${vars.document}` : key
    )) as typeof window.t;
  });

  afterEach(() => {
    cleanup();
    window.t = ((key: string) => key) as typeof window.t;
  });

  it('identifies the document with source name and source-relative path', () => {
    renderDialog();
    expect(screen.getByText(
      'knowledge.unsaved.description:Main / Notes/A.md',
    )).toBeTruthy();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('defaults focus to Save and exposes Save, Discard and Cancel in order', () => {
    renderDialog();
    const buttons = screen.getAllByRole('button');
    expect(buttons.map(button => button.textContent)).toEqual([
      'knowledge.unsaved.save',
      'knowledge.unsaved.discard',
      'knowledge.unsaved.cancel',
    ]);
    expect(buttons[0]).toHaveFocus();
  });

  it('treats Escape exactly as Cancel without saving or discarding', () => {
    const { props } = renderDialog();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onDiscard).not.toHaveBeenCalled();
  });

  it('traps Tab and Shift+Tab among modal controls', () => {
    renderDialog();
    const [save, discard, cancel] = screen.getAllByRole('button');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(discard).toHaveFocus();
    cancel.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(save).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Tab',
      shiftKey: true,
    });
    expect(cancel).toHaveFocus();
  });

  it('does not close when its modal backdrop is clicked', () => {
    const { props, container } = renderDialog();
    fireEvent.click(container.querySelector('[data-knowledge-modal]')!);
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('requires an available writable source and valid Markdown target for an orphan', () => {
    const { props } = renderDialog({
      document: {
        address: { sourceKey: 'lost', relativePath: 'Notes/A.md' },
        sourceName: 'Lost',
        orphan: true,
      },
      writableSources: [],
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'knowledge.unsaved.noWritableSource',
    );
    expect(screen.getByRole('button', {
      name: 'knowledge.unsaved.save',
    })).toBeDisabled();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('passes the explicitly selected source and new Page path for orphan save', () => {
    const archive: KnowledgeSourceDto = {
      sourceKey: 'archive',
      displayName: 'Archive',
      role: 'mounted',
      capabilities: ['write'],
      availability: 'available',
    };
    const { props } = renderDialog({
      document: {
        address: { sourceKey: 'lost', relativePath: 'Notes/A.md' },
        sourceName: 'Lost',
        orphan: true,
      },
      writableSources: [...writableSources, archive],
    });
    fireEvent.change(screen.getByLabelText('knowledge.unsaved.source'), {
      target: { value: 'archive' },
    });
    fireEvent.change(screen.getByLabelText('knowledge.unsaved.relativePath'), {
      target: { value: 'Recovered/A.md' },
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'knowledge.unsaved.save',
    }));
    expect(props.onSave).toHaveBeenCalledWith({
      address: {
        sourceKey: 'archive',
        relativePath: 'Recovered/A.md',
      },
      sourceName: 'Archive',
    });
  });

  it('adds the Markdown extension once for an orphan Page name', () => {
    const { props } = renderDialog({
      document: {
        address: { sourceKey: 'lost', relativePath: 'Notes/A.md' },
        sourceName: 'Lost',
        orphan: true,
      },
    });
    fireEvent.change(screen.getByLabelText('knowledge.unsaved.relativePath'), {
      target: { value: 'Recovered/A-copy' },
    });
    fireEvent.click(screen.getByRole('button', {
      name: 'knowledge.unsaved.save',
    }));
    expect(props.onSave).toHaveBeenCalledWith({
      address: {
        sourceKey: 'main',
        relativePath: 'Recovered/A-copy.md',
      },
      sourceName: 'Main',
    });
  });

  it('keeps the modal open and reports create conflict or unavailable save', () => {
    const { rerender } = renderDialog({ error: 'conflict' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'knowledge.unsaved.conflict',
    );
    rerender(<UnsavedDocumentsDialog
      document={{
        address: { sourceKey: 'main', relativePath: 'Notes/A.md' },
        sourceName: 'Main',
        orphan: false,
      }}
      writableSources={writableSources}
      error="unavailable"
      onSave={vi.fn()}
      onDiscard={vi.fn()}
      onCancel={vi.fn()}
    />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'knowledge.unsaved.unavailable',
    );
  });
});
