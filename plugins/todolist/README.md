# Hana Todo 插件（替换升级包）

这是 `todolist` 内置插件的 0.2.0 重构版。目录设计为直接复制到 HanaKDE 仓库的 `plugins/todolist/`，保留插件 ID `todolist` 与现有 16 个 namespaced 工具入口。

## 安装

1. 关闭正在运行的 HanaKDE/HanaKDE。
2. 备份现有 `plugins/todolist/`，以及 Hana 为该插件分配的数据目录。
3. 删除旧的 `plugins/todolist/`。
4. 将本包中的整个 `todolist/` 目录复制为 `plugins/todolist/`。
5. 启动 Hana。插件会自动读取 `store.v2.json`；发现旧 `store.v1.json` 时会先创建 `store.v1.json.pre-v2.bak`，再迁移到 v2。
6. 在 Hana 插件诊断中确认 `todolist` 已 loaded，并打开 Todo Page 做一次手动 CRUD smoke。

预构建的 `assets/page.js` 与 `assets/page.css` 已包含在包内，因此普通替换不要求先执行前端构建。

## 关键行为

- Page、HTTP routes、tools 和 lifecycle handlers 通过同一 `dataDir` 级 Runtime 与 Store 工作；请求主体、Session 和 capability bus 仍逐调用传入，不被单例缓存。
- Todo 默认为 `manual`。日期、截止时间本身不会隐式创建 Reminder 或 Agent Run。
- Reminder/Agent trigger 只通过宿主 TaskRegistry 调度，正式字段为 `runAt`；插件没有轮询扫描器或第二套调度器。
- Reminder 只记录 handoff 事实，不虚构 delivered；取消只有在宿主确认后才是 `cancelled`。
- Agent Session 接受任务不等于业务成功；Run 只有在匹配 Session 的终态事件后进入终态。
- 周期 occurrence 是独立 Todo，关联不可变 RuleVersion；支持 `only_this` 与 `this_and_future`。
- Import 采用持久 preview、digest、actor、目标 revision、TTL 和 command id；commit 是原子、追加且幂等的。
- Agent workspace 只保存 Hana Resource picker 返回的 JSON-safe opaque `ResourceRef`，拒绝绝对路径与凭据字段。绝对路径只可在一次调用中由 ResourceIO materialize 后临时使用。
- 生产 Page Shell 加载宿主 `hana-css`、插件 CSS、正确 locale，并转义主题/URL输入。

## 数据文件

插件私有数据仅写入 `ctx.dataDir`：

- `store.v2.json`：当前权威 Store。
- `store.v2.json.bak`：最近一次提交前的备份。
- `store.v1.json.pre-v2.bak`：首次 v1→v2 迁移时的只读备份。
- `exports/`：仅用于向 `stageFile` 暂存生成的 JSON，最多保留 20 个；未提供 `stageFile` 时文件会立即删除并以内联文档返回。

迁移不会重新激活旧 TaskRegistry schedule 或复用旧 Session。旧的运行中状态会变为显式的 `unknown` / `needs_action`，由用户检查后重试。

## 开发验证

在仓库根依赖已经安装的前提下：

```bash
cd plugins/todolist
npm run verify
```

`verify` 会执行严格 TypeScript、Node 测试、UI 资产构建、浏览器脚本语法检查，以及一个删除 `node_modules` 后的独立目录入口加载 smoke。

真实宿主集成仍应在 HanaKDE 仓库中执行 PluginManager/load、TaskRegistry、Session/ResourceIO 和正式 Page E2E；本包不使用替代服务器来宣称这些宿主流程已通过。

## 目录分层

```text
routes/                    HTTP 与 Page 薄适配层
tools/                     用户级 namespaced tools
src/domain/                领域实体、时间、周期、状态约束
src/application/           Commands/queries、outbox、exchange、projections
src/infrastructure/        Store、TaskRegistry/Session/ResourceIO adapters
src/interfaces/            请求、工具和错误边界
src/ui/                    React adapter 与无依赖浏览器实现
assets/                    可直接运行的预构建 JS/CSS
tests/                     contract、application、fault、migration 测试
scripts/verify-package.mjs 独立安装目录 smoke
```
