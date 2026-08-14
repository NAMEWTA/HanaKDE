# todolist 0.1.x → 0.2.0 迁移说明

## 自动迁移

插件启动时按以下顺序处理：

1. 已存在 `store.v2.json`：按 v2 读取。
2. 不存在 v2、存在 `store.v1.json`：复制为 `store.v1.json.pre-v2.bak`，迁移并原子写入 v2。
3. 两者都不存在：创建空 v2 Store。

迁移失败会阻断写入并返回稳定的 `migration_failed`/`store` 诊断；不会用空 Store 覆盖原文件。

## 安全变化

- v1 的 Reminder/Run/Attempt 历史会保留为可审计记录，但旧 schedule 与 Session 不会自动复活。
- v1 的 raw workspace 字符串不会迁移为 ResourceRef；受影响 Todo 会保持安全的手动模式，需要用户重新选择 Hana workspace 后再启用 Agent execution。
- 旧 priority `normal` 规范化为 `medium`。
- 旧 Reminder exact 时间可保留为 disabled trigger；用户必须显式重新启用。
- 不支持通过 SQLite、未知 schema 或任意对象直接写 Store；只能走 JSON exchange preview/commit。

## 回滚

若需要回滚代码：

1. 停止 Hana。
2. 保存当前 `store.v2.json` 供排查。
3. 恢复旧插件目录。
4. 将 `store.v1.json.pre-v2.bak` 复制回旧实现期望的 `store.v1.json`。

旧实现不能读取 v2，因此不要把 `store.v2.json` 改名后交给旧实现。
