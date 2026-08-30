---
schema_version: 3
artifact: ticket
change: 2026-08-28-knowledge-explorer-convergence
id: T-00
title: 移除已拒绝的内置工作台插件
status: done
planning_depth: standard
planning_depth_reason: 删除两个 builtin 插件并清理协议、持久化、构建和测试的跨层残留
ready: true
risk: medium
blocked_by: []
contract_ids: [AC-012]
owner: root
expected_changes: ["<Path>plugins/finance-workbench/**</Path>", "<Path>plugins/markdown-wechat/**</Path>", "<Path>package.json</Path>", "<Path>eslint.config.js</Path>", "<Path>shared/persistence/store-registry.ts</Path>", "<Path>core/plugin-manager.ts</Path>", "<Path>packages/plugin-protocol/src/index.ts</Path>", "<Path>packages/plugin-sdk/src/index.ts</Path>", "<Path>desktop/src/react/plugin-ui/capabilities.ts</Path>", "<Path>tests/**</Path>"]
writable_paths: ["<Path>plugins/finance-workbench/**</Path>", "<Path>plugins/markdown-wechat/**</Path>", "<Path>package.json</Path>", "<Path>package-lock.json</Path>", "<Path>eslint.config.js</Path>", "<Path>shared/persistence/store-registry.ts</Path>", "<Path>core/plugin-manager.ts</Path>", "<Path>packages/plugin-protocol/src/index.ts</Path>", "<Path>packages/plugin-sdk/src/index.ts</Path>", "<Path>desktop/src/react/plugin-ui/capabilities.ts</Path>", "<Path>tests/**</Path>"]
read_only_paths: ["<Path>core/engine.ts</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-00: 移除已拒绝的内置工作台插件

## 1. 战略与来源

- **目标：** 停止加载并删除 Finance Workbench 与 Markdown WeChat。
- **来源：** 用户明确否决两个实验插件，要求以 upstream 为基准清理。
- **可观察产出：** 启动、测试与打包 inventory 均不再包含两个插件；Todo 和 upstream builtin 不受影响。

## 2. 决策状态

- 删除仓库内插件源码和生成资产，而非仅通过配置隐藏。
- 删除唯一消费者已消失的 `plugin.page.open` 协议/SDK/UI capability。
- 保留通用插件页面、Todo、内部 seed/OTA 签名和用户 `HANA_HOME` 数据。
- 未决问题：无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 两个插件、孤立 capability、构建/持久化登记、测试排除 | PluginManager、现有插件协议与 Todo | 用户数据、历史 release/SpecDev evidence、其余插件重构 |

## 4. 要构建什么

删除两个 builtin 目录和所有 live-code 注册接缝，重建持久化 inventory/fingerprint，并增加真实 bundled inventory 的否定断言。

## 5. 实现契约

- **入口：** PluginManager builtin scan、UI capability registry、plugin SDK/protocol。
- **不变量：** `finance-workbench` 与 `markdown-wechat` 不得被扫描、打包或注册。
- **兼容性：** 有真实消费者的通用插件能力保持不变。
- **失败行为：** 残留空目录也必须由 inventory 测试捕获。
- **数据：** 不删除或迁移 `HANA_HOME/plugin-data`。

## 6. 执行路线

1. 删除两个插件目录与构建排除。
2. 删除 `plugin.page.open` 的协议、SDK 和 renderer handler。
3. 清理持久化登记并重建 receipt。
4. 添加 PluginManager absence 回归。
5. 运行 focused/full tests、typecheck、lint 和 build。

## 7. 路径访问契约

- **可写范围：** frontmatter `writable_paths`。
- **只读参照：** `<Path>core/engine.ts</Path>`。
- **保留：** Todo、其余 builtin、内部 artifact 签名和用户目录。
- **历史：** archive/release digest 只作为历史记录，不回写。

## 8. 验证矩阵

| 风险 | 接缝 | 命令/步骤 | 预期结果 |
|---|---|---|---|
| 空目录仍被加载 | real PluginManager scan | focused plugin-manager Vitest | 两个 id 均不存在 |
| 协议残留 | static/unit | SDK/protocol/capability tests + `rg` | 无 live capability |
| receipt 漂移 | persistence | registry/tripwire tests | inventory 与 fingerprint 一致 |
| 全局回归 | repository | full Vitest、typecheck、lint、build | 全部通过 |

- **E2E disposition：** not-required；插件缺席由真实 bundled PluginManager inventory 和构建 receipt 更直接验证。
- **E2E owner/environment：** Lead / current-workspace Node 24 build/test environment。
- **Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-28-knowledge-explorer-convergence/evidence/T-00.md</Path>`。

## 9. 发布、迁移与恢复

- **迁移：** 无用户数据迁移；遗留 plugin-data 保留。
- **监控：** bundled diagnostics、route registry 和 persistence receipt。
- **恢复：** 仅通过版本控制恢复插件源码；不依赖用户数据回滚。
- **发布：** 本 Ticket 不授权 commit、push 或 release。

## 10. 验收标准

- [x] 两个插件源码和生成资产从仓库移除。
- [x] `plugin.page.open` 及专属 live-code 登记移除。
- [x] Todo 和其余 builtin inventory 继续通过。
- [x] full tests、typecheck、lint 和 build 通过。
- [x] 用户数据和历史 evidence 未删除。
- [x] 后续独立授权已取得，implementation/direct-parent result 为 `b0c74282`。
