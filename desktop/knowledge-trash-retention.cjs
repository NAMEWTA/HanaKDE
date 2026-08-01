const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 60 * 60 * 1000;

function createKnowledgeTrashRetentionScheduler({
  listExpiredEntries,
  moveToSystemTrash,
  now = Date.now,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  log = () => {},
}) {
  if (typeof listExpiredEntries !== "function" || typeof moveToSystemTrash !== "function") {
    throw new TypeError("Knowledge trash retention scheduler requires list and move functions");
  }
  let interval = null;
  let lastAttemptAt = null;
  let running = null;
  let lastResult = Object.freeze({ attempted: 0, succeeded: 0, failed: 0 });

  async function run() {
    let entries;
    try {
      entries = await listExpiredEntries();
    } catch (error) {
      lastResult = Object.freeze({ attempted: 0, succeeded: 0, failed: 1 });
      log(error);
      return lastResult;
    }
    let succeeded = 0;
    let failed = 0;
    for (const entry of Array.isArray(entries) ? entries : []) {
      try {
        if (await moveToSystemTrash(entry)) succeeded += 1;
        else failed += 1;
      } catch (error) {
        failed += 1;
        log(error);
      }
    }
    lastResult = Object.freeze({ attempted: Array.isArray(entries) ? entries.length : 0, succeeded, failed });
    return lastResult;
  }

  function checkNow({ force = false } = {}) {
    const current = now();
    if (running) return running;
    if (!force && lastAttemptAt !== null && current - lastAttemptAt < DAY_MS) return Promise.resolve(lastResult);
    lastAttemptAt = current;
    running = run().finally(() => { running = null; });
    return running;
  }

  return Object.freeze({
    start() {
      if (interval !== null) return;
      void checkNow();
      interval = setIntervalFn(() => { void checkNow(); }, Math.max(1, pollIntervalMs));
      interval?.unref?.();
    },
    stop() {
      if (interval === null) return;
      clearIntervalFn(interval);
      interval = null;
    },
    checkNow,
    getLastResult: () => lastResult,
  });
}

module.exports = {
  DAY_MS,
  createKnowledgeTrashRetentionScheduler,
};
