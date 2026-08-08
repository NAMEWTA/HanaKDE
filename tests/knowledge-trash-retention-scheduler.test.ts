import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKnowledgeTrashRetentionScheduler } from '../desktop/knowledge-trash-retention.cjs';

describe('knowledge trash retention scheduler', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-08-01T00:00:00.000Z') }));
  afterEach(() => vi.useRealTimers());

  it('runs after startup and no more than once per rolling day while the app stays alive', async () => {
    const listExpiredEntries = vi.fn(async () => [
      { sourceKey: 'main', relativePath: '.trash/a/payload/old.md' },
    ]);
    const moveToSystemTrash = vi.fn(async () => true);
    const scheduler = createKnowledgeTrashRetentionScheduler({
      listExpiredEntries,
      moveToSystemTrash,
      pollIntervalMs: 60 * 60 * 1_000,
    });

    scheduler.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(listExpiredEntries).toHaveBeenCalledTimes(1);
    expect(moveToSystemTrash).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(23 * 60 * 60 * 1_000);
    expect(listExpiredEntries).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1_000);
    expect(listExpiredEntries).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('isolates resource failures so later expired entries still move', async () => {
    const first = { sourceKey: 'main', relativePath: '.trash/a/payload/first.md' };
    const second = { sourceKey: 'main', relativePath: '.trash/a/payload/second.md' };
    const moveToSystemTrash = vi.fn(async (address) => {
      if (address === first) throw new Error('locked');
      return true;
    });
    const scheduler = createKnowledgeTrashRetentionScheduler({
      listExpiredEntries: vi.fn(async () => [first, second]),
      moveToSystemTrash,
    });

    await scheduler.checkNow();

    expect(moveToSystemTrash).toHaveBeenCalledTimes(2);
    expect(scheduler.getLastResult()).toEqual({ attempted: 2, succeeded: 1, failed: 1 });
  });
});
