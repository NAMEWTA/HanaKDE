import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeDragController } from '../../components/knowledge-workspace/knowledge-drag-controller';

describe('KnowledgeDragController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('expands a valid collapsed target after exactly 800ms without changing payload', () => {
    const onExpand = vi.fn();
    const controller = new KnowledgeDragController({ onExpand });
    controller.begin({
      kind: 'knowledge-resources', sourceKey: 'main',
      addresses: [{ sourceKey: 'main', relativePath: 'a.md' }],
    });
    controller.hover({
      address: { sourceKey: 'main', directoryPath: 'folder' },
      directory: true,
      expanded: false,
    });
    vi.advanceTimersByTime(799);
    expect(onExpand).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpand).toHaveBeenCalledWith({ sourceKey: 'main', directoryPath: 'folder' });
    expect(controller.state().effect).toBe('move');
  });

  it('reports edge scroll, cancels hover timers, and rejects file-row drops', () => {
    const onExpand = vi.fn();
    const controller = new KnowledgeDragController({ onExpand });
    controller.begin({ kind: 'external-files', nativeRequestId: 'native_request_1234' });
    controller.hover({
      address: { sourceKey: 'main', directoryPath: 'folder' },
      directory: false,
      expanded: false,
    }, 0.95);
    expect(controller.state()).toMatchObject({ effect: 'none', edgeScroll: 1 });
    expect(controller.drop()).toBeNull();
    vi.runAllTimers();
    expect(onExpand).not.toHaveBeenCalled();
  });
});
