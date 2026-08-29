---
schema_version: 3
artifact: ticket
change: 2026-08-29-todolist-backend-reliability
id: T-01
title: 恢复 Todo 宿主后台并验证完整 CRUD
status: in_progress
planning_depth: standard
planning_depth_reason: 修复跨越宿主启动时序、插件页面和真实磁盘路由测试，但不改变数据模型
ready: true
risk: medium
blocked_by: []
contract_ids: [AC-001, AC-002, AC-003, AC-004, AC-005, AC-006]
owner: root
expected_changes: ["<Path>server/index.ts</Path>", "<Path>tests/server-port-ownership.test.ts</Path>", "<Path>plugins/todolist/src/ui/browser-app.ts</Path>", "<Path>plugins/todolist/assets/page.js</Path>", "<Path>plugins/todolist/tests/**</Path>"]
writable_paths: ["<Path>server/index.ts</Path>", "<Path>tests/server-port-ownership.test.ts</Path>", "<Path>plugins/todolist/**</Path>", "<Path>speculo/.speculo/specdev/changes/2026-08-29-todolist-backend-reliability/**</Path>", "<Path>speculo/.speculo/specdev/status.json</Path>"]
read_only_paths: ["<Path>speculo/.speculo/specdev/archive/**</Path>", "<Path>pnpm-lock.yaml</Path>", "<Path>pnpm-workspace.yaml</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-01: 恢复 Todo 宿主后台并验证完整 CRUD

## 1. 战略与来源

- **目标：** 复用既有 Todo builtin 插件，恢复真实宿主 task backend 和完整 CRUD。
- **来源：** 用户报告 Todo 后台不可用并要求完善 Todo List 增删改查。
- **可观察产出：** `/status` 报告 ready；Todo/Project CRUD 持久化；页面失败可恢复。

## 2. 决策状态

- Feature placement 裁决为 builtin plugin：能力可通过插件页面、routes、tools 和 TaskRegistry 完整交付。
- 根因已确认是宿主 TaskRegistry handler 安装顺序，不另建 Store 或调度器。
- commit、push、版本提升和 release 未授权。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 宿主注册顺序、页面 timeout/cancel、真实 CRUD 回归 | Todo Store v2、routes、application/domain、TaskRegistry | schema 迁移、用户数据清理、新调度器、提交发布 |

## 4. 要构建什么

移动既有 TaskRegistry bus handler 到 plugin init 前；为页面 SDK 请求添加有界超时和销毁取消；用真实 Hono routes 与临时磁盘 Store 覆盖 Todo/Project CRUD；在真实 authenticated Desktop plugin surface 验证页面全流程。

## 5. 实现契约

- TaskRegistry handler 必须先于 `engine.initPlugins`。
- 页面超时默认 10 秒，可由测试配置缩短；dispose 必须立即取消 pending 请求。
- CRUD 测试不得 mock Store/application service。
- 不改变 HTTP envelope、Store schema 和现有两参数 `mountTodoApp` 调用。

## 6. 执行路线

1. 添加并观察 ordering 与 permanent-loading 红灯测试。
2. 修复宿主顺序和页面请求生命周期。
3. 添加 Todo/Project route + disk Store CRUD 测试。
4. 重建 page asset，执行插件 verify 和宿主专项门禁。
5. 重启真实 Desktop，验证 status 与页面 CRUD；最后执行全仓门禁。

## 7. 路径访问契约

- **可写：** frontmatter `writable_paths` 中的宿主、Todo 与本 change 工件。
- **只读：** Speculo archive 与用户未跟踪 pnpm 文件。
- **共享：** 无；当前 workspace 串行执行。
- **保护：** 不读取或删除用户 Todo 数据；E2E 只创建并清理一个可识别测试项。

## 8. 验证矩阵

| 风险 | 接缝 | 命令/步骤 | 预期结果 |
|---|---|---|---|
| 注册时序回归 | server/task tests | focused Vitest | handler 早于 plugin init，bus contract 通过 |
| CRUD 只在 mock 中工作 | route + disk Store | plugin HTTP CRUD test | Todo/Project 全流程和重启持久化通过 |
| 页面永久 loading | browser DOM | UI host tests | timeout 后错误和重试可见，dispose 立即清理 |
| 关联能力退化 | plugin regression | `npm run verify` | reminder/Agent/recurrence/exchange/migration 全通过 |
| 真实宿主授权或路由错误 | Desktop E2E | local Electron at `http://127.0.0.1:37453` with authenticated plugin surface session | backend ready；完整 Todo 页面 CRUD 无 401/403 |
| 跨仓回归 | repository | typecheck/lint/full Vitest | 全部适用门禁通过 |

- **E2E disposition：** required。
- **E2E owner/environment：** root；current-workspace macOS Electron Desktop，连接本地真实 Server 和 authenticated plugin surface session。
- **Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-29-todolist-backend-reliability/evidence/T-01.md</Path>`。

## 9. 发布、迁移与恢复

无数据迁移。回滚只涉及 handler 位置和页面 request wrapper；Store v2 文件保持兼容。当前未授权 commit/push/release，不执行发布动作。

## 10. 验收标准

- [x] 红灯顺序与永久 loading 均已复现。
- [x] 宿主启动顺序和页面失败出口已实现。
- [x] Todo/Project 真实 HTTP CRUD 已覆盖。
- [x] Todo 插件完整 verify 和真实页面 CRUD 已通过。
- [x] 仓库级静态门禁完成；full suite 的既有 fingerprint 阻塞已记录。
- [ ] 获得独立授权后再执行 commit/integration。
