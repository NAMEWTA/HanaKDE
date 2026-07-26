import { KnowledgeWorkspaceError } from "../../shared/knowledge-workspace-errors.ts";
import type { ResourceExportEntry, ResourceVersion } from "./types.ts";

/**
 * 知识工作区实施契约 §5.2 冻结的 provider-neutral transfer 硬边界：
 * chunk ≤ 1 MiB、并发 file stream ≤ 4、进程内 transfer buffer ≤ 8 MiB，
 * 单个顶层 transfer 计划 ≤ 100,000 entries、≤ 128 层、≤ 100 GiB 已知
 * aggregate size。V1 不提供任何绕过开关。
 */
export const TRANSFER_MAX_CHUNK_BYTES = 1024 * 1024;
export const TRANSFER_MAX_CONCURRENT_FILE_STREAMS = 4;
export const TRANSFER_MAX_BUFFERED_BYTES = 8 * 1024 * 1024;
export const TRANSFER_MAX_ENTRIES = 100_000;
export const TRANSFER_MAX_DEPTH = 128;
export const TRANSFER_MAX_AGGREGATE_BYTES = 100 * 1024 * 1024 * 1024;

const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;

export function transferLimitExceeded(limit: number, actual: number): KnowledgeWorkspaceError {
  return new KnowledgeWorkspaceError(
    "knowledge_transfer_limit_exceeded",
    "Resource transfer exceeds a fixed V1 limit",
    { limit, actual },
  );
}

export function transferEntryUnsupported(state: string): KnowledgeWorkspaceError {
  return new KnowledgeWorkspaceError(
    "knowledge_transfer_entry_unsupported",
    "Resource transfer entry is unsupported",
    { state },
  );
}

export function transferTargetConflict(): KnowledgeWorkspaceError {
  return new KnowledgeWorkspaceError(
    "knowledge_resource_conflict",
    "Resource transfer target already exists",
    { state: "target_exists" },
  );
}

export function transferVersionConflict(state: string): KnowledgeWorkspaceError {
  return new KnowledgeWorkspaceError(
    "knowledge_version_conflict",
    "Resource transfer expected-version check failed",
    { state },
  );
}

export function transferAborted(): Error {
  const error = new Error("resource transfer aborted");
  error.name = "AbortError";
  return error;
}

export function throwIfTransferAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw transferAborted();
}

export function isTransferAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * 传输目标状态的确定性版本编码。expected-version 只在同一编码空间内
 * 比较：`undefined`/`null` 表示期望目标不存在，字符串表示期望目标当前
 * 恰好处于该编码版本（替换语义）。
 */
export function encodeResourceTransferVersion(version: ResourceVersion | undefined): string {
  const canonical = {
    mtimeMs: finiteVersionNumber(version?.mtimeMs),
    size: version?.size === null ? null : finiteVersionNumber(version?.size),
    sha256: nonEmptyVersionString(version?.sha256),
    etag: nonEmptyVersionString(version?.etag),
    sequence: finiteVersionNumber(version?.sequence),
  };
  return `v1:${encodeURIComponent(JSON.stringify(canonical))}`;
}

function finiteVersionNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonEmptyVersionString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * provider 无关的名称段词法：非空、非 `.`/`..`、不含 `/` 与控制字符。
 * 字面 `\` 允许出现，由目标 provider 按平台规则复验（实施契约 §7）。
 */
export function isTransferNameSegment(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value !== "."
    && value !== ".."
    && !value.includes("/")
    && !CONTROL_CHARACTER_PATTERN.test(value);
}

/**
 * 单个顶层 transfer 的计划跟踪器：验证 entry 结构、名称段、父先于子的
 * 顺序、重复路径，并在任何副作用前对 entries/深度/aggregate 上限拒绝。
 */
export class TransferPlanTracker {
  #entries = 0;
  #aggregateFileBytes = 0;
  #seen = new Set<string>();
  #directories = new Set<string>();

  get entryCount(): number {
    return this.#entries;
  }

  get aggregateFileBytes(): number {
    return this.#aggregateFileBytes;
  }

  admit(entry: ResourceExportEntry): void {
    this.#entries += 1;
    if (this.#entries > TRANSFER_MAX_ENTRIES) {
      throw transferLimitExceeded(TRANSFER_MAX_ENTRIES, this.#entries);
    }
    if (!entry || typeof entry !== "object" || !Array.isArray(entry.path)) {
      throw transferEntryUnsupported("invalid_entry_shape");
    }
    for (const segment of entry.path) {
      if (!isTransferNameSegment(segment)) {
        throw transferEntryUnsupported("invalid_entry_path");
      }
    }
    const depth = entry.path.length + 1;
    if (depth > TRANSFER_MAX_DEPTH) {
      throw transferLimitExceeded(TRANSFER_MAX_DEPTH, depth);
    }
    if (entry.path.length === 0 && this.#entries !== 1) {
      throw transferEntryUnsupported("multiple_root_entries");
    }
    if (entry.path.length > 0 && this.#entries === 1) {
      throw transferEntryUnsupported("missing_root_entry");
    }
    const key = entry.path.join("/");
    if (this.#seen.has(key)) {
      throw transferEntryUnsupported("duplicate_entry_path");
    }
    if (entry.path.length > 0) {
      const parentKey = entry.path.slice(0, -1).join("/");
      if (!this.#directories.has(parentKey)) {
        throw transferEntryUnsupported("entry_before_parent_directory");
      }
    }
    this.#seen.add(key);
    if (entry.kind === "directory") {
      this.#directories.add(key);
      return;
    }
    if (entry.kind === "file") {
      if (!Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0) {
        throw transferEntryUnsupported("unknown_file_size");
      }
      if (!entry.version || typeof entry.version !== "object") {
        throw transferEntryUnsupported("missing_file_version");
      }
      this.#aggregateFileBytes += entry.sizeBytes;
      if (this.#aggregateFileBytes > TRANSFER_MAX_AGGREGATE_BYTES) {
        throw transferLimitExceeded(TRANSFER_MAX_AGGREGATE_BYTES, this.#aggregateFileBytes);
      }
      return;
    }
    if (entry.kind === "symbolic_link") {
      if (typeof entry.linkTarget !== "string" || entry.linkTarget.length === 0) {
        throw transferEntryUnsupported("invalid_link_target");
      }
      return;
    }
    throw transferEntryUnsupported("unsupported_entry_kind");
  }

  finish(): void {
    if (this.#entries === 0) {
      throw transferEntryUnsupported("missing_root_entry");
    }
  }
}

type BudgetWaiter = {
  resolve: () => void;
  reject: (error: unknown) => void;
  detachAbort: () => void;
};

/**
 * 进程内 transfer buffer 预算：已从来源读出但尚未写入目标的字节总量
 * 不得超过固定容量；超出时挂起生产者形成 backpressure，取消时拒绝
 * 全部等待者。
 */
export class TransferBudget {
  #capacity: number;
  #used = 0;
  #peak = 0;
  #waiters: BudgetWaiter[] = [];

  constructor(capacityBytes: number = TRANSFER_MAX_BUFFERED_BYTES) {
    if (!Number.isSafeInteger(capacityBytes) || capacityBytes <= 0) {
      throw new Error("TransferBudget requires a positive capacity");
    }
    this.#capacity = capacityBytes;
  }

  get usedBytes(): number {
    return this.#used;
  }

  get peakBytes(): number {
    return this.#peak;
  }

  async acquire(bytes: number, signal?: AbortSignal): Promise<void> {
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new Error("TransferBudget acquire requires non-negative bytes");
    }
    if (bytes > this.#capacity) {
      throw transferLimitExceeded(this.#capacity, bytes);
    }
    throwIfTransferAborted(signal);
    while (this.#used + bytes > this.#capacity) {
      await new Promise<void>((resolve, reject) => {
        const waiter: BudgetWaiter = {
          resolve: () => {
            waiter.detachAbort();
            resolve();
          },
          reject,
          detachAbort: () => {},
        };
        this.#waiters.push(waiter);
        if (signal) {
          const onAbort = () => {
            const index = this.#waiters.indexOf(waiter);
            if (index >= 0) this.#waiters.splice(index, 1);
            reject(transferAborted());
          };
          waiter.detachAbort = () => signal.removeEventListener("abort", onAbort);
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });
      throwIfTransferAborted(signal);
    }
    this.#used += bytes;
    if (this.#used > this.#peak) this.#peak = this.#used;
  }

  release(bytes: number): void {
    this.#used = Math.max(0, this.#used - bytes);
    const waiters = this.#waiters.splice(0);
    for (const waiter of waiters) waiter.resolve();
  }
}

// 所有 ResourceIO 实例共享同一进程预算，避免多个并发 transfer 各自
// 获得 8 MiB 而突破实施契约的“进程内总量”。
export const processTransferBudget = new TransferBudget();

/**
 * 有限并发闸门：file stream 并发写入不超过固定上限，槽位释放后按
 * 到达顺序唤醒等待者。
 */
export class TransferStreamGate {
  #limit: number;
  #active = 0;
  #peak = 0;
  #waiters: Array<{
    resolve: () => void;
    reject: (error: unknown) => void;
    detachAbort: () => void;
  }> = [];

  constructor(limit: number = TRANSFER_MAX_CONCURRENT_FILE_STREAMS) {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error("TransferStreamGate requires a positive limit");
    }
    this.#limit = limit;
  }

  get activeStreams(): number {
    return this.#active;
  }

  get peakStreams(): number {
    return this.#peak;
  }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    throwIfTransferAborted(signal);
    while (this.#active >= this.#limit) {
      await new Promise<void>((resolve, reject) => {
        const waiter = {
          resolve: () => {
            waiter.detachAbort();
            resolve();
          },
          reject,
          detachAbort: () => {},
        };
        this.#waiters.push(waiter);
        if (signal) {
          const onAbort = () => {
            const index = this.#waiters.indexOf(waiter);
            if (index >= 0) this.#waiters.splice(index, 1);
            reject(transferAborted());
          };
          waiter.detachAbort = () => signal.removeEventListener("abort", onAbort);
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });
      throwIfTransferAborted(signal);
    }
    this.#active += 1;
    if (this.#active > this.#peak) this.#peak = this.#active;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#active -= 1;
      this.#waiters.shift()?.resolve();
    };
  }
}

/**
 * 验证 provider 已遵守 ≤ 1 MiB chunk SPI，并把 chunk 纳入进程内预算。
 * 不能在此处把超大 chunk 事后切小：provider 一旦产出它，内存上限就已
 * 被突破，必须 fail closed。budget 的释放点是消费者拉取下一 chunk 时。
 */
export async function* boundedChunkStream(
  body: AsyncIterable<Uint8Array>,
  budget: TransferBudget,
  signal?: AbortSignal,
): AsyncIterable<Uint8Array> {
  const iterator = body[Symbol.asyncIterator]();
  let completed = false;
  try {
    while (!completed) {
      // 在向 provider 拉取下一块之前先预留一个完整 chunk，避免任意数量的
      // 并发 iterator 各自持有一个尚未计费的块而突破进程 8 MiB 上限。
      await budget.acquire(TRANSFER_MAX_CHUNK_BYTES, signal);
      let reserved = true;
      try {
        const next = await iterator.next();
        if (next.done) {
          completed = true;
          continue;
        }
        const chunk = next.value;
        throwIfTransferAborted(signal);
        if (!(chunk instanceof Uint8Array)) {
          throw transferEntryUnsupported("invalid_file_chunk");
        }
        if (chunk.byteLength > TRANSFER_MAX_CHUNK_BYTES) {
          throw transferEntryUnsupported("file_chunk_exceeds_limit");
        }
        if (chunk.byteLength === 0) continue;
        yield chunk;
      } finally {
        if (reserved) {
          budget.release(TRANSFER_MAX_CHUNK_BYTES);
          reserved = false;
        }
      }
    }
  } finally {
    try {
      if (!completed) await iterator.return?.();
    } catch {
      // 保留原始 transfer 失败；provider 的 best-effort iterator cleanup
      // 不应覆盖它。
    }
  }
}

/**
 * 执行期 entry 流包装：逐 entry 复验计划约束并把 file body 换成
 * 预算受控的 bounded chunk 流。
 */
export async function* guardedTransferEntries(
  entries: AsyncIterable<ResourceExportEntry>,
  tracker: TransferPlanTracker,
  budget: TransferBudget,
  signal?: AbortSignal,
): AsyncIterable<ResourceExportEntry> {
  const planned: ResourceExportEntry[] = [];
  for await (const entry of entries) {
    throwIfTransferAborted(signal);
    tracker.admit(entry);
    planned.push(entry);
  }
  tracker.finish();

  // 先完成整棵树的元数据计划和硬上限校验，再允许 importer 创建 staging。
  // file body 保持惰性的一次性流，不会把文件正文收集进内存。
  for (const entry of planned) {
    throwIfTransferAborted(signal);
    if (entry.kind === "file") {
      yield { ...entry, body: boundedChunkStream(entry.body, budget, signal) };
    } else {
      yield entry;
    }
  }
}
