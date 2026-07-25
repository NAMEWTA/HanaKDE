# 来源分区索引存储契约

本文件冻结 `KW-RULE-INDEX` 的可编码协议。实现必须使用仓库已有 `better-sqlite3`，不得在 Ticket 40—46 之间重新选择存储引擎、数据库位置、迁移方式或 rebuild 切换算法。

## 1. 所有权与位置

每个活动来源拥有独立索引目录：

```text
<HANA_HOME>/knowledge-workspace/index/v1/
  <workspace-fingerprint>/
    <source-fingerprint>/
      current.json
      generation-<generation-id>.sqlite
      generation-<generation-id>.sqlite-wal
      generation-<generation-id>.sqlite-shm
      build-<rebuild-id>.sqlite
      writer.lock/
```

- fingerprint 是 Server 依据 ProviderRootIdentity 计算的 SHA-256，不包含可逆绝对路径。
- 索引目录不位于来源根，不进入 ResourceIO 普通 list/search/watch。
- 每来源独立损坏、锁定、重建和清理；一个来源失败不能阻止其他来源查询。

## 2. SQLite 运行参数

每次打开数据库后执行并验证：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
```

- 所有写入经单一 source writer queue。
- 读事务不得持有超过一个请求生命周期。
- 不允许 Renderer、route 或 extractor 直接持有 `Database` 实例。

## 3. Schema v1

```sql
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE resources (
  resource_id INTEGER PRIMARY KEY,
  relative_path TEXT NOT NULL UNIQUE,
  parent_path TEXT NOT NULL,
  basename TEXT NOT NULL,
  extension TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('page','text','image','pdf','audio','video','binary','link','unknown')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  mtime_ms INTEGER NOT NULL,
  version_token TEXT NOT NULL,
  content_state TEXT NOT NULL CHECK (content_state IN ('indexed','metadata-only','rejected','missing')),
  content_reason TEXT,
  indexed_at_ms INTEGER NOT NULL
) STRICT;

CREATE INDEX resources_parent_idx ON resources(parent_path, basename);
CREATE INDEX resources_kind_idx ON resources(kind, relative_path);

CREATE TABLE pages (
  resource_id INTEGER PRIMARY KEY REFERENCES resources(resource_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  frontmatter_json TEXT,
  body_text TEXT NOT NULL,
  body_hash TEXT NOT NULL
) STRICT;

CREATE TABLE headings (
  resource_id INTEGER NOT NULL REFERENCES resources(resource_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 6),
  text TEXT NOT NULL,
  slug TEXT NOT NULL,
  from_offset INTEGER NOT NULL,
  to_offset INTEGER NOT NULL,
  PRIMARY KEY (resource_id, ordinal)
) STRICT;

CREATE TABLE links (
  source_resource_id INTEGER NOT NULL REFERENCES resources(resource_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  link_kind TEXT NOT NULL CHECK (link_kind IN ('wikilink','embed','markdown','content-ref')),
  raw_target TEXT NOT NULL,
  resolved_relative_path TEXT,
  fragment TEXT,
  from_offset INTEGER NOT NULL,
  to_offset INTEGER NOT NULL,
  PRIMARY KEY (source_resource_id, ordinal)
) STRICT;
CREATE INDEX links_target_idx ON links(resolved_relative_path, source_resource_id);

CREATE TABLE tags (
  resource_id INTEGER NOT NULL REFERENCES resources(resource_id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('frontmatter','body')),
  PRIMARY KEY (resource_id, tag, origin)
) STRICT;
CREATE INDEX tags_value_idx ON tags(tag, resource_id);

CREATE TABLE tasks (
  resource_id INTEGER NOT NULL REFERENCES resources(resource_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  checked INTEGER NOT NULL CHECK (checked IN (0,1)),
  text TEXT NOT NULL,
  from_offset INTEGER NOT NULL,
  to_offset INTEGER NOT NULL,
  PRIMARY KEY (resource_id, ordinal)
) STRICT;

CREATE VIRTUAL TABLE content_fts USING fts5(
  relative_path UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);
```

`meta` 必须包含：`schema_version=1`、`generation_id`、`source_fingerprint`、`created_at_ms`、`last_complete_sequence`、`extractor_contract_version`。

## 4. 身份与写入

- 唯一资源身份是当前来源内规范 `relative_path`；sourceKey 由分区外层提供，不重复写入每行。
- 一次资源更新在一个 SQLite transaction 中删除旧派生行并写入新 `resources/pages/headings/links/tags/tasks/content_fts`。
- 资源变为超限、不可解码、PDF 或二进制时，必须删除旧正文、结构、链接、标签、任务和 FTS 行，只保留 metadata。
- 删除或移动事件必须重读磁盘确认；event payload 不是索引事实。

## 5. Schema 版本与迁移

- V1 不执行 in-place schema migration。
- `schema_version`、`extractor_contract_version` 或完整性检查不匹配时，当前 generation 标为 `stale` 或 `corrupt`，启动新 generation rebuild。
- 旧 generation 在新 generation ready 前继续只读服务；不存在可用 generation 时状态为 `unavailable`。
- 迁移失败不修改 `current.json`。

## 6. Full rebuild 与原子切换

1. 获取 source writer lock，创建 `build-<rebuild-id>.sqlite`。
2. 记录 rebuild 的 root identity、scope token、开始 sequence 与 extractor contract version。
3. 通过 ResourceIO 遍历并抽取，每 200 个资源或 50ms 主动 yield；支持 AbortSignal。
4. 完成后运行 `PRAGMA quick_check`、行数不变量和来源 scope 重验。
5. 关闭 staging 数据库，fsync 数据库与父目录。
6. 把 staging 重命名为新的 `generation-<id>.sqlite`。
7. 以 `current.json.tmp` 写入新 generation manifest，fsync 后原子 rename 为 `current.json`。
8. 新查询使用新 generation；已开始的查询完成后释放旧 generation lease。
9. 旧 generation 保留至少一个上一个完整版本，24 小时后且无 lease 时清理。

取消、进程退出或任一步失败不得替换 `current.json`。启动时删除超过 24 小时且不在 manifest 中的 `build-*`。

## 7. 增量更新与并发

- 每来源一个 FIFO writer queue；同一 relativePath 的待处理事件折叠为最后一次磁盘重读。
- debounce 窗口 100ms，上限 500ms；5,000 events/10s 或 sequence gap 触发 reconcile scan。
- operationId 相同的内部事件合并，但不能跳过 commit 后磁盘重读。
- active generation 增量写入使用事务；full rebuild 期间增量事件进入 replay queue。新 generation 切换前重放开始 sequence 之后的事件，再做一次 scope 和 sequence 检查。

## 8. Writer lock

`writer.lock/` 通过原子 `mkdir` 获取，包含 `owner.json`：pid、hostId、startedAt、heartbeatAt、sourceFingerprint。

- heartbeat 每 10 秒更新。
- 同 host 且 PID 存活时绝不抢锁。
- heartbeat 超过 60 秒且同 host PID 不存在，可回收。
- 不同 host 的锁在 5 分钟无 heartbeat 后仍不自动抢占，状态为 `locked`，由用户关闭另一实例或显式修复。
- 锁不可用时查询旧 generation，禁止增量写和 rebuild。

## 9. Health API

```ts
type KnowledgeIndexHealth =
  | { state: 'ready'; generationId: string; sequence: number }
  | { state: 'building'; generationId?: string; rebuildId: string; progress: number }
  | { state: 'stale'; generationId: string; reason: string }
  | { state: 'degraded'; generationId: string; reason: string }
  | { state: 'corrupt'; generationId?: string; reason: string }
  | { state: 'locked'; generationId?: string; ownerHint: string }
  | { state: 'unavailable'; reason: string };
```

API 不返回数据库路径、绝对来源路径、正文或 SQLite 原始错误。

## 10. 必测故障

- staging 构建取消、磁盘满、rename 失败、manifest 写入失败。
- active generation 损坏、WAL 损坏、schema mismatch。
- watcher burst、sequence gap、重复/乱序事件、内部 operation correlation。
- rebuild 期间 source 消失或 scope token 改变。
- Windows 上打开句柄与 rename 行为；多进程 writer lock。
- 旧正文在类型/编码/大小门禁改变后被彻底移除。
