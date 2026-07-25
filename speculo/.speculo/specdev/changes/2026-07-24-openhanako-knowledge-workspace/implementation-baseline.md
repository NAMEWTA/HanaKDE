# HanaKDE 知识工作区实施基线

## Git

| 项 | 值 |
|---|---|
| 实现分支 | `hanakde` |
| 审计 HEAD | `a7ff307c` |
| 上游 | `upstream/main` |
| 上游 commit | `ef8a6f70` |
| merge-base | `ef8a6f70` |
| 产品版本 | `0.416.51` |
| 项目许可证 | Apache-2.0 |

本表是本 change 的审计基线，不替代真实仓库检查。当前分支、HEAD、版本、关键接缝与工作树状态必须在 Ticket 01 开始时于仓库根当场人工确认；检查只读，绝不清理、reset、checkout 或覆盖用户修改。

## 真实调用图

```text
PreviewEditor.tsx
  -> desktop/src/react/editor/md-decorations.ts
  -> table-field.ts / mermaid-field.ts / markdown-commands.ts
  -> expected-version write / checkpoints / file watch

DeskTree.tsx
  -> desktop/src/react/stores/desk-actions.ts
  -> /api/desk/* (Full) or /api/mobile/workbench/* (compatibility)
  -> MountAwareFileService
  -> ResourceIO

Open root
  -> /api/resource-io/*
  -> /api/studio/workspaces/*

Resource events
  -> ResourceEventBus
  -> ResourceWatchRegistry
  -> server/resource-events-ws.ts
  -> Renderer WorkspaceFileChangeBridge
```

## 已有能力与差距

| 领域 | 已有能力 | 本 change 必须补齐 |
|---|---|---|
| ResourceIO | stat/read/write/expected-version/edit/mkdir/delete/list/search/materialize/copy/rename/move/trash/watch | HTTP copy/mkdir/delete；知识地址适配；operation correlation |
| Mount | Studio registry、MountProvider、scope/capabilities | main/附加来源会话模型；根不重叠；历史 key |
| Desk | 真树、排序、筛选、多选、拖拽、rename/move/create/safeDelete、watch refresh | 兼容 facade；Knowledge 独立状态 |
| UI persistence | tabs、expanded paths、selection、reading positions 按 workspace 保存 | 保留 Desk；Knowledge 明确不恢复 |
| CM6 | Live Preview、表格、数学、Mermaid、commands、block handles、history | policy-driven surface；知识语义 IR；新 Markdown 能力 |
| Preview save | 600ms autosave、expected-version、checkpoint、外部变化 | Knowledge manual save 与三方冲突，不改 Preview |
| Attachment | Electron `copyFile/writeFileBinary`、`文本附件`、Markdown links | Knowledge ResourceIO、同级 assets、Wikilink、跨来源 copy |
| Asset | MediaViewer、PDF/文本/媒体 preview、sanitizer、resource URL | Knowledge open policy、刷新、文件信息和安全矩阵 |
| Search | ResourceIO 文件名/内容 search | 来源分区结构/标签/引用索引和超级搜索 |
| Composition | Open/Full boundary 与 standalone server | Open knowledge route；Desk/Mobile 兼容迁移 |

## 已确认的契约风险

1. `ResourceRef` 已存在，不能再用于 `{sourceKey, relativePath}`。
2. `/api/desk/*` 是 Full-only；`/api/mobile/workbench/*` 仍为 evidence-needed。
3. `ResourceIO.copy` 对不同 kind 拒绝，local-file → mount 不能作为跨来源复制实现。
4. `MountProvider.copy` 可在 mount kind 内复制；rename/move 强制同 mount。
5. ResourceIO HTTP 未暴露 copy/mkdir/delete。
6. `workspaceMountId` 表示可替代 cwd 的活动根，不等同于 Knowledge 附加来源。
7. Desk 的持久 UI 状态与 Knowledge V1 空白状态必须分命名空间。
8. 现有 link-open 和 HTML/asset 工具必须通过知识安全策略复用，不能直接放开外链。

## 实现开始前必须重新验证

以下项目不是永久成立的历史结论，而是 Ticket 01 必须在当前本地仓库重新执行并写入 ticket 交付记录的门禁：

- `npm run typecheck`
- `npm run lint:boundary`
- ResourceIO、Desk、Mobile、composition、PreviewEditor 与 CM6 相关回归
- `npm run build:server:open`
- `npm run smoke:server:open`
- `better-sqlite3` 可加载并启用 SQLite FTS5

任何失败都保持 Ticket 01 未完成；不得把本文中的审计值当作当前执行结果。


## 可执行 Preflight 契约

可读基线即本文。实现开始前在**仓库根**按下列项人工核对（本 change 包仅含 Markdown，无独立校验脚本）：

1. 当前 Git 分支为 `hanakde`；`a7ff307c` 仍是 HEAD 祖先（不要求 HEAD 永远等于审计提交）。
2. Node 满足 `package.json` 的 `engines.node`（基线 `>=24.12.0 <25`）。
3. `package.json` 名称 `hanako`、版本 `0.416.51` 与关键 scripts/dependencies 仍可用（见上文与 Ticket 01）。
4. 关键接缝存在：`desktop/preload.cjs`、`desktop/main.cjs`、`desktop/src/react/components/PreviewEditor.tsx`、`server/composition/open-root.ts`、`server/composition/full-root.ts`、`server/routes/resource-io.ts`、`lib/resource-io/resource-io.ts`、`lib/resource-io/types.ts`、`scripts/build-server-open.mjs`、`scripts/smoke-open-server.mjs`。
5. 顶层目录存在：`desktop/`、`server/`、`core/`、`lib/`、`shared/`、`tests/`、`packages/`、`scripts/`、`silverbullet/`。
6. `silverbullet/` 参考与 [`silverbullet-reference-matrix.md`](./silverbullet-reference-matrix.md) 一致；`better-sqlite3` 可加载且 SQLite FTS5 可用。
7. dirty 工作树只记录警告，不允许自动化清理用户修改。

关键接缝、Node、package 或 SilverBullet 参考漂移会阻止 Ticket 01 完成，须先重新审计并同步本 change 文档。

Ticket 01 同时固定 `@playwright/test@1.62.0` 和 `test:knowledge:e2e:*` scripts，避免发布阶段才选择 E2E 栈。
