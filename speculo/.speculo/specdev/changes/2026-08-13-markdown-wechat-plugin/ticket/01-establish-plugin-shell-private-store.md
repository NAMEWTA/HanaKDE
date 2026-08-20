---
schema_version: 3
artifact: ticket
change: 2026-08-13-markdown-wechat-plugin
id: T-01
title: 建立内置插件盒与私有数据闭环
status: ready
planning_depth: deep
planning_depth_reason: 新增 builtin manifest、Page/Widget surface、插件私有 versioned envelope 和跨 surface 恢复合同，是全部后续 Ticket 的共享根契约。
ready: true
risk: high
blocked_by: []
contract_ids: [AC-001, AC-002, AC-011, AC-012]
owner: unassigned
expected_changes: ["<Path>plugins/markdown-wechat/manifest.json</Path>", "<Path>plugins/markdown-wechat/index.ts</Path>", "<Path>plugins/markdown-wechat/routes/**</Path>", "<Path>plugins/markdown-wechat/src/**</Path>", "<Path>plugins/markdown-wechat/assets/**</Path>", "<Path>plugins/markdown-wechat/tests/**</Path>"]
writable_paths: ["<Path>plugins/markdown-wechat/**</Path>"]
read_only_paths: ["<Path>core/plugin-manager.ts</Path>", "<Path>core/plugin-context.ts</Path>", "<Path>packages/plugin-sdk/src/index.ts</Path>", "<Path>examples/plugins/sdk-showcase/**</Path>", "<Path>skills2set/hana-plugin-creator/**</Path>", "<Path>temp/md-wechat/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-01: 建立内置插件盒与私有数据闭环

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/ticket/01-establish-plugin-shell-private-store.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-01.md</Path>`

## 1. 战略与来源

- **目标：** 建立可被 PluginManager 自动发现的 `markdown-wechat` builtin full-access 插件，注册 Page `/page`、Widget `/widget` 和同一插件私有数据 envelope。
- **可观察产出：** Hana diagnostics 显示插件 loaded、Page/Widget 可打开并调用 `hana.ready()`；重载后 Page 与 Widget 恢复同一 Markdown 草稿和设置，数据损坏时显示可恢复错误。
- **来源：** US-005、US-006、AC-001、AC-002、AC-011、AC-012、ADR-001、ADR-002、ADR-006、CODE `<Path>core/plugin-manager.ts</Path>`。
- **当前事实：** builtin 扫描目录由 PluginManager 提供；Page/Widget 必须 full-access 并有 routes；插件私有 `dataDir` 可用，宿主不提供独立 surface 的 SessionFile 身份。
- **Planning Depth 原因：** manifest、surface、私有 schema 和恢复不变量会影响全部后续行为，且错误会导致插件无法加载或丢稿。

## 2. 决策状态

### 已锁定决策

- 插件 id、目录为 `markdown-wechat` / `<Path>plugins/markdown-wechat/</Path>`，manifest 声明 hidden、full-access、Page、Widget、`resource.pick`、`clipboard.writeText` 等实际使用的 UI capability。
- private envelope 是插件私有数据唯一权威，至少包含 schemaVersion、active Markdown、theme、font、fontSize、dirty/save metadata；Page 与 Widget 读取同一存储。
- Page/Widget 导出不创建 SessionFile；Agent tool 的 SessionFile 由后续 T-05 处理。

### 已采用的低影响假设

- 使用 React/Vite assets 或等价 self-contained UI bundle，具体文件拆分不改变 route 和数据合同。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| manifest、插件入口、Page/Widget route shell、private envelope/store、加载和恢复测试、最小 `manifest.dev.scenarios` 声明 | PluginManager discovery、`hana.ready()`、`hana.api.fetch()`、Hana theme query 和插件 `dataDir` | Markdown renderer 细节、剪贴板、ResourceIO 文章读取、Agent tool、宿主/根依赖改动 |

## 4. 要构建什么

冷启动或打开 Page 时，插件读取 versioned private envelope；不存在时建立空草稿，存在且版本支持时恢复；损坏或未知版本时保留安全空状态并显示恢复错误，不覆盖原始私有文件。Widget 读取同一 envelope 的摘要和设置，并导航到 Page；它不得创建第二份文档、使用 iframe localStorage 作为权威或伪造 SessionFile。

## 5. 实现契约

- **入口或接缝：** `manifest.json`、PluginManager route loader、Page/Widget route shell、plugin `dataDir` private store。
- **输入与输出：** private envelope JSON；route 返回脱敏的文档摘要/设置和稳定错误类别，不返回绝对路径或 secrets。
- **公共接口变化：** 新增 builtin plugin surfaces 和插件私有 routes；不修改宿主接口。
- **不变量：** Page/Widget 使用相同 schema key 和 envelope；写入原子或等价 fail-closed；导入/导出/Agent 不能绕过该边界。
- **状态或数据流：** surface load -> private read/validate -> ready/empty/recovery-error；edit/settings -> debounce save -> versioned envelope。
- **错误与失败行为：** 缺失创建空草稿；损坏/未知 schema 显示可恢复错误并保留内存状态；写入失败不丢当前草稿。
- **兼容要求：** 遵守 PluginManager source priority、UI host capability registry 和 iframe route query 的 `hana-theme`/`hana-css` 合同。
- **安全与隐私要求：** 只读插件私有数据；不接触用户工作区、浏览器旧数据库、绝对路径或第三方网络。

## 6. 执行路线

1. 建立 manifest、入口、routes/assets/tests 骨架，先用 PluginManager fixture 证明目标加载接缝。
2. 实现 private envelope schema、校验、原子保存/恢复和版本拒绝语义。
3. 接入 Page/Widget 最小 shell 与同源摘要，覆盖 `hana.ready()`、theme/css 参数和窄 surface 基线。
4. 注入缺失、损坏、未知版本和写入失败场景，确认当前内存草稿保持可恢复。
5. 运行插件测试与 PluginManager surface smoke，形成 Evidence 后交给 T-02。

## 7. 路径访问契约

- **预计修改点：** `expected_changes` 所列 `<Path>plugins/markdown-wechat/</Path>` 内文件。
- **可写范围：** `<Path>plugins/markdown-wechat/**</Path>`。
- **只读上下文：** `<Path>core/plugin-manager.ts</Path>`、`<Path>core/plugin-context.ts</Path>`、`<Path>packages/plugin-sdk/src/index.ts</Path>`、`<Path>examples/plugins/sdk-showcase/**</Path>`、`<Path>skills2set/hana-plugin-creator/**</Path>`、`<Path>temp/md-wechat/**</Path>`。
- **共享路径：** 无；本 Ticket 是插件根契约 owner。
- **保留或不动：** 宿主、根 package/lock、公共测试、其它插件和参考项目。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | PluginManager + surface fixture | `npx vitest run <Path>plugins/markdown-wechat/tests/plugin-shell.test.ts</Path>` | builtin loaded，Page/Widget route 可达，`hana.ready()` 完成 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-01.md</Path>` |
| 失败路径 | private store 故障注入 | 同一测试覆盖 missing/corrupt/unsupported/write failure | 错误可见，内存草稿保留，不伪造恢复成功 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-01.md</Path>` |
| UI E2E（owner：当前执行 owner） | Page/Widget reload smoke | Playwright 打开两个 surface、编辑、重载 | 两个 surface 读同一 envelope，Widget 无第二编辑器 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-01.md</Path>` |
| 回归 | PluginManager existing tests | `npx vitest run <Path>tests/plugin-manager.test.ts</Path> <Path>tests/plugin-ui-contributions.test.ts</Path>` | 既有插件 discovery/UI 合同保持 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-01.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 仅初始化 private envelope v1；不读取旧浏览器数据库。
- **兼容窗口：** 缺失 envelope 视为空草稿；未知 schema fail closed，不自动迁移。
- **监控信号：** plugin loaded、surface route、private schema version、恢复/写入错误类别。
- **回滚或前向恢复：** 删除插件目录即可移除功能；私有数据损坏保留原文件并创建内存恢复状态，不覆盖用户资源。
- **不可逆操作与批准点：** 无。
- **收缩条件：** T-01 Evidence 证明加载、同源恢复和删除边界后，后续 Ticket 才能接管插件根。

## 10. 验收标准

- [ ] AC-001、AC-002、AC-011、AC-012：插件加载、Page/Widget surface、私有 envelope 和同源恢复通过。
- [ ] 正常/失败/UI E2E/回归验证全部写入 `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-01.md</Path>`。
- [ ] 实际修改不超出 `<Path>plugins/markdown-wechat/**</Path>`。
- [ ] 无未批准宿主 API、数据迁移或范围偏差。
