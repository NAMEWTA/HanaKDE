# 复合操作日志与崩溃恢复契约

本文件冻结 `KW-RULE-OP` 与 `KW-RULE-RECOVERY`。所谓“原子重命名/移动”是对用户可观察结果的事务性与可恢复性承诺，不宣称跨多个文件、索引和进程具有底层文件系统的瞬时全局原子性。

## 1. 持久位置

```text
<HANA_HOME>/knowledge-workspace/operations/v1/<operation-id>/
├── journal.json
├── journal.json.prev
├── result.json
└── artifacts/                 # 仅存必要 checkpoint/export 引用，不复制普通未保存输入
```

journal 不保存正文、凭证或绝对路径，只保存 KnowledgeResourceAddress、provider opaque identity、version token、checkpoint id、步骤与错误码。

## 2. Operation ID、计划与幂等

- `operationId` 使用 UUIDv7。
- plan 规范 JSON 计算 `requestHash=sha256(canonical-json)`。
- plan TTL 固定 15 分钟；commit 后结果保留 7 天。
- 第一次 commit 记录 requestHash。相同 operationId + 相同 requestHash 的重复 commit 返回已有进行中或最终结果；不同 hash 返回 `OPERATION_ID_REUSED`。
- plan 与 commit 都重新验证 owner、source capability、root scope token、expected version 和目标冲突。

## 3. 状态机

```text
PLANNED
  -> PREPARING
  -> PREPARED
  -> COMMITTING
  -> COMMITTED
  -> FINALIZED

PREPARING/PREPARED/COMMITTING
  -> ROLLING_BACK
  -> ROLLED_BACK

任一恢复不确定状态
  -> RECOVERY_REQUIRED
  -> COMMITTING | ROLLING_BACK | FAILED_PERMANENTLY
```

合法状态写入必须先落盘 `journal.json.tmp`、fsync、原子 rename；保留上一份 `journal.json.prev`。任何副作用前先持久化下一步 intent，副作用后再持久化 outcome。

## 4. Item 状态

```ts
type OperationItemState =
  | 'pending'
  | 'prepared'
  | 'applying'
  | 'applied'
  | 'rolling-back'
  | 'rolled-back'
  | 'failed'
  | 'recovery-required';
```

每个最外层资源是批次原子单元。批次是否允许部分完成由 operation kind 固定：

| Kind | 批次语义 |
|---|---|
| copy/import/delete/restore/cleanup | 资源级原子，批次允许部分完成 |
| same-source rename/move | 整个用户操作必须可回滚；任一必要文件或链接写入失败进入 rollback |
| create | 单资源原子 |

## 5. Prepare

Prepare 必须：

1. 规范化并去除祖先/后代重复项。
2. 获取地址锁并按 sourceKey、relativePath 稳定排序，避免死锁。
3. 读取 expected versions、root scope token 和目标占用。
4. 处理受影响 dirty sessions；未解决前不得继续。
5. 为高风险写入建立 checkpoint，并记录 checkpoint id。
6. 计算临时目标名、最终目标名、链接重写集合、session identity 变更和 index invalidation。
7. 将完整步骤写入 PREPARED journal。

## 6. Commit 顺序

同源 rename/move 固定顺序：

1. 重验 root identity、versions、目标与 lock ownership。
2. provider rename/move 主资源。
3. 对每个受影响 Markdown 页面执行 expected-version 原子写；每页是单次 write。
4. 更新 Server document session identity projection。
5. 发布带 operationId 的 ResourceEvent。
6. index coordinator 重读磁盘并确认 convergence。
7. 写 COMMITTED，再生成公开 result，最后写 FINALIZED。

copy/import 使用同目录临时名写入、fsync 后 rename 到最终名；目录使用 staging sibling 目录，完整复制后单次 rename。不得让正式目标出现半个目录树。

## 7. Rollback

- 回滚严格按已应用步骤逆序执行。
- 主资源移动回原址前重验当前 identity，避免覆盖外部新文件。
- 链接页面从 checkpoint 或保存的 expected-version 恢复；若目标已被外部修改，标记 `recovery-required`，不得强制覆盖。
- session identity 和 index 只能在磁盘恢复确认后回退。
- rollback 失败返回逐项状态并保留 journal/checkpoint；不得删除证据或宣称成功。

## 8. 启动恢复屏障

Server 注册任何 Knowledge mutation route 前必须运行 recovery scan：

- `PLANNED` 且超过 TTL：标记过期并清理。
- `PREPARING`：无副作用时回滚为 ROLLED_BACK。
- `PREPARED`：释放过期锁，保持可重新 commit 或 cancel。
- `COMMITTING`：逐步探测磁盘事实；能确定全部完成则继续 commit，能确定可逆则 rollback，否则 RECOVERY_REQUIRED。
- `ROLLING_BACK`：继续逆序恢复。
- `COMMITTED`：重建 result、补 index convergence，再 FINALIZED。

恢复期间受影响 source 的 mutation 返回 `SOURCE_RECOVERY_IN_PROGRESS`；只读操作可继续，但 UI 必须显示 degraded 状态。

## 9. Watcher 与索引

- ResourceOperationContext 必须携带 operationId、requestId、owner/session。
- watcher 事件是提示；journal 与磁盘是恢复事实。
- index 只在磁盘步骤确认后更新；不得因为收到内部 event 就假定 commit 成功。
- rollback 产生新的同 operationId 事件并带 reason=`rollback`。

## 10. 清理与隐私

- FINALIZED/ROLLED_BACK 结果保留 7 天；FAILED_PERMANENTLY 与 RECOVERY_REQUIRED 保留直到用户导出摘要并显式确认清理。
- 日志摘要只含 sourceKey、脱敏 relativePath、step、errorCode、rollback status。
- 普通未保存输入不写 journal；只有高风险操作需要的 checkpoint 由既有 checkpoint service 管理。

## 11. 必测故障点

每个 mutation service 必须可注入：prepare 后崩溃、主资源移动后崩溃、第 N 个链接写入失败、session 更新失败、event 发布失败、index convergence 超时、rollback 第 N 步失败、系统废纸篓失败、磁盘满和权限变化。
