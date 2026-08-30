---
schema_version: 3
artifact: ticket
change: 2026-08-30-entity-dossier-plugin
id: T-11
title: 装配 Hana Dossiers 插件并完成主机 E2E
status: done
planning_depth: deep
planning_depth_reason: 最终切片跨插件 manifest、route-backed Page、host API、生产打包和全部用户旅程，是发布集成门。
ready: true
risk: high
blocked_by: [T-04, T-08, T-09, T-10]
contract_ids: [AC-001, AC-002, AC-017, AC-032]
owner: root
expected_changes: ["<Path>plugins/dossiers/manifest.json</Path>", "<Path>plugins/dossiers/package.json</Path>", "<Path>plugins/dossiers/tsconfig.json</Path>", "<Path>plugins/dossiers/build.ts</Path>", "<Path>plugins/dossiers/index.ts</Path>", "<Path>plugins/dossiers/routes/page.ts</Path>", "<Path>plugins/dossiers/src/ui/page.tsx</Path>", "<Path>plugins/dossiers/src/ui/browser-app.ts</Path>", "<Path>plugins/dossiers/assets/**</Path>", "<Path>plugins/dossiers/scripts/**</Path>", "<Path>plugins/dossiers/tests/e2e/**</Path>", "<Path>plugins/dossiers/README.md</Path>"]
writable_paths: ["<Path>plugins/dossiers/manifest.json</Path>", "<Path>plugins/dossiers/package.json</Path>", "<Path>plugins/dossiers/tsconfig.json</Path>", "<Path>plugins/dossiers/build.ts</Path>", "<Path>plugins/dossiers/index.ts</Path>", "<Path>plugins/dossiers/routes/page.ts</Path>", "<Path>plugins/dossiers/src/ui/page.tsx</Path>", "<Path>plugins/dossiers/src/ui/browser-app.ts</Path>", "<Path>plugins/dossiers/assets/**</Path>", "<Path>plugins/dossiers/scripts/**</Path>", "<Path>plugins/dossiers/tests/e2e/**</Path>", "<Path>plugins/dossiers/README.md</Path>"]
read_only_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/application/**</Path>", "<Path>plugins/dossiers/src/infrastructure/**</Path>", "<Path>plugins/dossiers/src/interfaces/**</Path>", "<Path>plugins/dossiers/src/ui/catalog/**</Path>", "<Path>plugins/dossiers/src/ui/operations/**</Path>", "<Path>plugins/dossiers/tools/**</Path>", "<Path>PLUGIN_SDK.md</Path>", "<Path>packages/plugin-runtime/**</Path>"]
shared_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path>", "<Path>plugins/dossiers/src/runtime.ts</Path>"]
shared_path_owners: ["<Path>plugins/dossiers/src/domain/**</Path> => T-01", "<Path>plugins/dossiers/src/infrastructure/workspace/**</Path> => T-01", "<Path>plugins/dossiers/src/runtime.ts</Path> => T-01"]
---

# Ticket T-11: 装配 Hana Dossiers 插件并完成主机 E2E

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/11-plugin-composition-and-e2e.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-11.md</Path>`

## 1. 战略与来源

- **目标：** 将全部能力装配成仅位于 `plugins/dossiers/` 的可发现全页面插件，并用真实 Hana 主机验证端到端行为与独立生产包。
- **可观察产出：** Hana Dossiers / 档案出现在插件入口，打开即为可操作工作台；Page、routes、tools、workspace resources 和全部恢复旅程可运行。
- **来源：** US-001、US-004、US-006、US-011；AC-001、AC-002、AC-017、AC-032；ADR-001、ADR-005、ADR-009；用户指定 hana-plugin-creator 约束。
- **当前事实：** 产品只允许插件 SDK/公开 runtime 接缝；不修改 core/server/desktop/shared/packages/root build/root dependencies。
- **Planning Depth 原因：** 这是跨所有边界的发布 Gate，错误会造成插件不可加载、沙箱越权或生产包缺少依赖。

## 2. 决策状态

### 已锁定决策

- plugin id 和目录为 `dossiers`，显示名 Hana Dossiers / 档案。
- 提供 full-access route-backed Page 和 Agent tools，browser 只经 `hana.api.fetch` 调同插件 route。
- 用户资源只通过 `ctx.resources`；不访问 renderer internals、内部 Knowledge routes、network 或 model.sample。
- 产品 diff 严格限制在 `plugins/dossiers/**`；生产插件包需脱离仓库源码独立 smoke。

### 已采用的低影响假设

- manifest 权限取满足已锁定能力的最小集合，并由实际 SDK schema 校验，不预先臆造字段。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| manifest/entry/build/Page shell/browser client/assets、真实 host E2E、standalone smoke | T-01–T-10、公开 SDK/runtime、现有 icons/tokens | 产品代码/根依赖修改、内部 API、市场发布、云服务 |

## 4. 要构建什么

按照插件创建器规范建立 `plugins/dossiers/` 的 manifest、entry、route-backed Page、browser bundle 和生产构建。Page 装配目录与操作 UI，通过 same-plugin API 路由到应用服务；主机 E2E 从安装/发现开始，验证创建档案、复制资料、搜索、Agent 相对引用、关闭模型、删除恢复、导出导入、迁移恢复和重启持久化。

## 5. 实现契约

- **入口或接缝：** plugin manifest/index、Page route、browser `hana.api.fetch`、static tools、`ctx.resources`。
- **输入与输出：** 主机 session/workspace context、route/tool payload、ResourceRef；输出完整 Page 与受控操作结果。
- **公共接口变化：** 新增 `dossiers` 插件及其 Page/routes/tools；无产品公共 API 改动。
- **不变量：** 所有产品代码变更均在插件目录；browser 无 Node/文件直访；无 repo-only unresolved bare imports。
- **状态或数据流：** host discover -> load entry -> render Page -> same-plugin routes/tools -> workspace authority -> UI refresh。
- **错误与失败行为：** manifest/permission/compatibility/resource 错误显示可恢复诊断；插件不崩溃 host、不越界降级。
- **兼容要求：** 以当前公开 SDK manifest/runtime 为准，启动时执行 T-08 compatibility gate。
- **安全与隐私要求：** 最小权限；CSP/escaping；不外发正文；敏感操作确认；生产产物扫描。

## 6. 执行路线

1. 按 hana-plugin-creator preflight 确认运行时、manifest schema 和相邻插件惯例。
2. scaffold `plugins/dossiers/`，装配 entry/routes/tools、browser client 和两组 UI feature。
3. 配置最小 manifest 权限、静态 assets、构建与 standalone production smoke。
4. 在真实 Hana 主机完成桌面/窄屏全用户旅程、重启、错误和恢复 E2E。
5. 扫描产品 diff、依赖、网络/模型调用、绝对路径/正文泄漏并形成最终 Evidence。

## 7. 路径访问契约

- **可写范围：** 仅 frontmatter 列出的插件装配、assets、scripts、E2E 和 README 路径。
- **只读/共享：** T-01–T-10 产物、公开 SDK/runtime；shared foundation 唯一 owner T-01。
- **保留或不动：** `core/**`、`server/**`、`desktop/**`、`shared/**`、`packages/**`、根 build/dependencies、其他插件。
- **偏差门：** 发现必须修改产品代码或根依赖时立即停止，回到 SpecDev 由用户批准范围变化。

## 8. 验证矩阵

| 行为或风险 | 接缝 | 步骤 | 预期 | Evidence |
|---|---|---|---|---|
| 发现与完整旅程 | real Hana host | install/load/create/add/search/Agent/export/import | 插件可发现且核心行为端到端成立 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-11.md</Path>` |
| 关闭/故障/恢复 | host + test workspace | toggle off、冲突、删除、重启、迁移中断 | fail closed，可恢复且权威不丢 | 同上 |
| 发布回归 | packed plugin sandbox | 独立安装/启动/route/tool/UI smoke | 无 repo-only import，无产品 diff，零未请求网络/模型调用 | 同上 |

- **Workspace checks：** manifest validator、type/lint/test/build、plugin diff allowlist、bundle/dependency/security scan。
- **E2E disposition：** required：全部跨 host、iframe、workspace resource、Agent tool 和重启边界行为。
- **E2E owner/environment：** Lead / parent-candidate 或 current workspace 的真实 Hana 主机；不得在 Ticket source worktree 宣称通过。
- **Integration evidence：** 每个 source commit、parent before、逐步 candidate、final result SHA 和父分支包含关系。

## 9. 发布、迁移与恢复

- **迁移顺序：** 装载 entry -> compatibility gate -> 必要迁移确认/恢复 -> index rebuild -> 开放 Page 写入。
- **兼容窗口：** 仅支持经 manifest/SDK 验证的当前宿主；数据格式按 T-08 matrix。
- **监控信号：** load/route/tool/action/status/latency 和脱敏错误，不含正文/绝对路径。
- **回滚或前向恢复：** 卸载/回退插件不删除 `Dossiers/`；升级失败保留旧数据和恢复入口。
- **不可逆操作与批准点：** 只允许由已实现的确认门触发；插件安装本身不迁移数据。
- **收缩条件：** standalone smoke、完整 E2E、diff allowlist、恢复演练全部有 Evidence 后才可发布。

## 10. 验收标准

- [x] AC-001、AC-002、AC-017、AC-032 及所有 required integration E2E 通过。
- [x] Hana Dossiers 在真实主机可发现，Page/tools/routes/ResourceRef 运行正常。
- [x] 生产包可独立 smoke，无 repo-only import、越界产品 diff、未请求网络/模型调用。
- [x] 桌面/窄屏无重叠或截断，核心流程可键盘操作。
- [x] commit、路径、Evidence、迁移恢复和偏差门满足。
