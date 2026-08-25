---
schema_version: 3
artifact: ticket
change: 2026-08-13-markdown-wechat-plugin
id: T-06
title: 交付策略扫描、诊断场景与可删除验证
status: done
planning_depth: standard
planning_depth_reason: 跨插件 manifest/source 静态策略、Plugin Dev Loop diagnostics/scenario 和隔离删除 smoke，但不改变宿主公共接口。
ready: true
risk: high
blocked_by: [T-02, T-05]
contract_ids: [AC-001, AC-016, AC-017, AC-018]
owner: root
expected_changes: ["<Path>plugins/markdown-wechat/tests/policy.test.ts</Path>", "<Path>plugins/markdown-wechat/tests/diagnostics.test.ts</Path>", "<Path>plugins/markdown-wechat/README.md</Path>"]
writable_paths: ["<Path>plugins/markdown-wechat/tests/policy.test.ts</Path>", "<Path>plugins/markdown-wechat/tests/diagnostics.test.ts</Path>", "<Path>plugins/markdown-wechat/README.md</Path>"]
read_only_paths: ["<Path>plugins/markdown-wechat/manifest.json</Path>", "<Path>core/plugin-manager.ts</Path>", "<Path>core/plugin-dev-service.ts</Path>", "<Path>server/routes/plugins.ts</Path>", "<Path>scripts/build-server.mjs</Path>", "<Path>PLUGINS.md</Path>", "<Path>skills2set/hana-plugin-creator/SKILL.md</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-06: 交付策略扫描、诊断场景与可删除验证

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/ticket/06-deliver-policy-diagnostics-and-removal.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-06.md</Path>`

## 1. 战略与来源

- **目标：** 证明插件不越过 v1 网络/迁移/静态 route 政策，PluginManager diagnostics/scenario 能观察关键 surfaces/tools，并能从隔离构建副本整块删除插件而不破坏 HanaKDE。
- **可观察产出：** diagnostics 显示 loaded、Page、Widget、routes、tool、activation 和失败类别；scenario 至少覆盖 open-page 和纯产出 tool；策略扫描无 network.fetch、第三方图床、旧数据库迁移、自定义静态 route；删除 smoke 构建启动成功。
- **来源：** AC-001、AC-016、AC-017、AC-018、ADR-001、ADR-004、ADR-005、`<Path>core/plugin-dev-service.ts</Path>`、`<Path>server/routes/plugins.ts</Path>`。
- **当前事实：** Plugin Dev Loop 提供 diagnostics/list surfaces/invoke tool/run scenario；server 通过 `<Path>plugins/</Path>` 扫描 builtin；官方 assets 路由不需自定义静态 route。
- **Planning Depth 原因：** 它跨构建、策略和运营诊断，但不修改宿主；错误会让不安全或不可删除插件发布，故 Standard/high。

## 2. 决策状态

### 已锁定决策

- v1 manifest 不声明 `network.fetch`；不实现第三方图床、旧浏览器数据库迁移或 iframe third-party fetch。
- UI 静态文件只能放 `assets/` 并由官方 plugin asset route 提供；不新增自定义 static route。
- builtin 可删除性是发布阻塞门；诊断失败不得隐藏 unresolved route/asset/tool。

### 已采用的低影响假设

- `manifest.dev.scenarios` 可在插件根内声明 open-page/tool smoke；若仓库版本只支持等价 diagnostics fixture，必须记录替代证据而不扩展宿主。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| manifest scenario、policy tests、diagnostics assertions、removal smoke README | PluginManager diagnostics、Plugin Dev Loop、official assets serving、build commands | 修改 core/server/build scripts、网络 capability、发布远程写入 |

## 4. 要构建什么

开发者安装/加载插件后，通过 diagnostics 看到 plugin id、source、status、contributions、surfaces、routes、tools 和 activation；运行 scenario 可重复打开 Page 并调用纯产出 tool。静态测试扫描插件根源码和 manifest，禁止第三方 URL/fetch、`localStorage`/`indexedDB`/`sqlite` migration、custom `/assets` route。隔离临时副本移除 `<Path>plugins/markdown-wechat/</Path>` 后，构建和其它插件加载仍成功。

## 5. 实现契约

- **入口或接缝：** Plugin Dev diagnostics/scenario endpoints、PluginManager scan/load fixture、static policy scanner、isolated build copy。
- **输入与输出：** plugin source/manifest -> diagnostics JSON, scenario result, policy findings, removal build status。
- **公共接口变化：** 无；scenario 只声明插件内 dev metadata。
- **不变量：** 删除插件不产生 unresolved imports；无网络/旧迁移/自定义静态 route；诊断输出脱敏且可重复。
- **状态或数据流：** source scan -> load -> diagnostics -> scenario; policy scan -> pass/fail; copy remove -> build/start smoke。
- **错误与失败行为：** 任一违规或 unresolved route/asset/tool 导致失败并指向具体插件路径；不静默跳过。
- **兼容要求：** 现有 Plugin Dev Loop 和 build-server 自动扫描惯例。
- **安全与隐私要求：** 扫描不得读用户旧浏览器数据库或打印 secrets。

## 6. 执行路线

1. 建立 manifest/scenario/diagnostics assertions，先让缺失 surfaces/tool 时失败。
2. 加入 policy scan，覆盖 network/migration/custom-route/absolute-path patterns。
3. 运行 Plugin Dev diagnostics、list surfaces、scenario 和 tool invoke smoke。
4. 在隔离构建副本删除插件目录，运行 build/start/unresolved import 检查。
5. 将策略、诊断和删除证据写入 Evidence，不修改宿主文件。

## 7. 路径访问契约

- **预计修改点：** frontmatter `expected_changes` 所列 policy/diagnostics/README 和插件内测试路径；manifest scenario 由 T-01 owner 维护。
- **可写范围：** frontmatter `writable_paths` 列出的 policy/diagnostics/README 路径；manifest 主文件只读。
- **只读上下文：** `<Path>core/plugin-manager.ts</Path>`、`<Path>core/plugin-dev-service.ts</Path>`、`<Path>server/routes/plugins.ts</Path>`、`<Path>scripts/build-server.mjs</Path>`、`<Path>PLUGINS.md</Path>`、`<Path>skills2set/hana-plugin-creator/SKILL.md</Path>`。
- **共享路径：** 无；只读验证宿主构建。
- **保留或不动：** 根构建脚本、server/core diagnostics 实现、其它插件和用户插件目录。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常 diagnostics | Plugin Dev diagnostics/list surfaces | `plugin.dev.diagnostics`、`plugin.dev.listSurfaces` 或对应 fixture | loaded、Page/Widget、routes、tool、activation 可观察 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-06.md</Path>` |
| scenario | T-01 manifest.dev.scenarios + Plugin Dev scenario | 运行 open-page 和 render tool scenario | 可重复完成，失败类别可诊断 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-06.md</Path>` |
| policy failure | static scan | `npx vitest run <Path>plugins/markdown-wechat/tests/policy.test.ts</Path>` | 无 network/migration/custom static route/third-party fetch | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-06.md</Path>` |
| removal regression | isolated copy | 临时复制仓库，删除 plugin dir，执行 `npm run build:server`/启动 smoke | 构建启动成功，其它插件无 unresolved import | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-06.md</Path>` |

- **Workspace checks：** Lead 在 current workspace 使用 Node 24 运行 policy/diagnostics 测试、插件 verify、宿主 diagnostics fixture 和隔离删除 build smoke。
- **E2E disposition：** required：真实 diagnostics/scenario、Page/tool surfaces 与可删除启动回归跨插件和宿主生命周期边界。
- **E2E owner/environment：** Lead / current-workspace；先运行 Plugin Dev 场景，再在可恢复临时副本中移除插件并执行 build/start smoke。
- **Integration evidence：** 记录 implementation commit、parent before、direct-parent diagnostics/removal 验证和 result SHA；临时副本路径与清理事实写入 Evidence。

## 9. 发布、迁移与恢复

- **迁移顺序：** 不适用：本 Ticket 只验证政策和可删除性。
- **兼容窗口：** scenario/diagnostics 遵循当前宿主协议，不承诺旧 dev API。
- **监控信号：** plugin load status、diagnostics errors、policy findings、removal smoke status。
- **回滚或前向恢复：** 删除插件目录是可逆发布回滚；违规插件不得进入最终整合。
- **不可逆操作与批准点：** 不远程发布、不修改安装目录；隔离副本删除需保留可重建源。
- **收缩条件：** AC-016～018 通过后才允许 T-07 发布汇合。

## 10. 验收标准

- [x] AC-001、AC-016、AC-017、AC-018：诊断、政策、scenario 和删除 smoke 通过。
- [x] Evidence 写入 `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-06.md</Path>`。
- [x] 不修改宿主/根构建脚本，所有 policy findings 均为零。
