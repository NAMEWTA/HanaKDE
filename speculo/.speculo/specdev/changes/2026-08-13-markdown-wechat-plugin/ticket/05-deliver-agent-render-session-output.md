---
schema_version: 3
artifact: ticket
change: 2026-08-13-markdown-wechat-plugin
id: T-05
title: 交付 Agent 纯产出渲染与 SessionFile
status: ready
planning_depth: deep
planning_depth_reason: 新增 namespaced Agent tool 的输入互斥、ResourceRef 读取、plugin_output 权限和 SessionFile 交付合同，涉及数据权限与 session identity。
ready: true
risk: high
blocked_by: [T-02]
contract_ids: [AC-013, AC-014, AC-015]
owner: root
expected_changes: ["<Path>plugins/markdown-wechat/tools/**</Path>", "<Path>plugins/markdown-wechat/src/tooling/**</Path>", "<Path>plugins/markdown-wechat/tests/agent-render.test.ts</Path>"]
writable_paths: ["<Path>plugins/markdown-wechat/tools/**</Path>", "<Path>plugins/markdown-wechat/src/tooling/**</Path>", "<Path>plugins/markdown-wechat/tests/agent-render.test.ts</Path>"]
read_only_paths: ["<Path>packages/plugin-runtime/src/index.ts</Path>", "<Path>core/plugin-manager.ts</Path>", "<Path>examples/plugins/sdk-showcase/tools/create-note.js</Path>", "<Path>plugins/markdown-wechat/manifest.json</Path>", "<Path>temp/md-wechat/src/lib/renderer.js</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-05: 交付 Agent 纯产出渲染与 SessionFile

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/ticket/05-deliver-agent-render-session-output.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-05.md</Path>`

## 1. 战略与来源

- **目标：** 提供 namespaced `markdown_wechat_render`（最终名称由 PluginManager 组合）工具，接受 Markdown 字符串或 ResourceRef，复用 T-02 renderer 并交付 HTML；有 session context 时登记 HTML SessionFile。
- **可观察产出：** Agent 可获得结构化 HTML 文本；带 `sessionId/sessionRef` 且 `stageFile()` 可用时有 media details；无 session 时明确说明无文件产出；不写 workspace/private document。
- **来源：** US-007、US-008、AC-008、AC-013、AC-014、AC-015、ADR-003、ADR-006、`<Path>examples/plugins/sdk-showcase/tools/create-note.js</Path>`。
- **当前事实：** PluginManager 为 tool 注入 invocation session context 和 `stageFile()`；plugin context `ctx.resources.read` 支持 ResourceRef；工具名会自动加插件 id namespace。
- **Planning Depth 原因：** 输入互斥、资源权限、SessionFile 身份和副作用声明是跨边界 Deep 合同。

## 2. 决策状态

### 已锁定决策

- `markdown` 与 `resourceRef` 必须恰好提供一个；两者均缺失或同时提供立即失败。
- Tool 是 read-only/pure-output；用户资源只读，生成物只写插件 dataDir 并通过 `stageFile()` 交付，不写用户 workspace。
- 无 session context 时返回 HTML 文本和明确状态，不伪造 SessionFile；有 session context 时注册 HTML SessionFile。

### 已采用的低影响假设

- 使用 T-02 renderer 的纯函数接口；若 renderer 返回降级诊断，tool 将其作为结构化文本而非吞掉。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| tool manifest/definition、input validation、ResourceRef read、HTML staging、tool tests | T-02 renderer、PluginManager tool loader、`stageFile()`/createMediaDetails、T-01 private boundary | workspace write、Page/Widget download、旧数据库、网络上传、绝对路径参数 |

## 4. 要构建什么

Agent 调用工具时传入 Markdown 或 ResourceRef。工具校验输入后读取/解码、调用同一 renderer，返回 HTML 和摘要。若调用上下文有 session identity，生成插件私有 HTML 文件并用 `toolCtx.stageFile({ sessionId/sessionRef, filePath, label })` 返回 media details；若没有 session identity，则只返回 HTML 文本和 `session_file: unavailable_without_session` 状态。ResourceRef 读取失败、输入互斥、渲染失败均返回可诊断错误，不触及 Page private document 或工作区。

## 5. 实现契约

- **入口或接缝：** `tools/*.ts|js` static loader、`execute(input, toolCtx)`、`ctx.resources.read`、`toolCtx.stageFile`、tool invocation fixture。
- **输入与输出：** `{ markdown?: string, resourceRef?: ResourceRef }` -> `content[]` + HTML details + optional media details/error details。
- **公共接口变化：** 新增 plugin-namespaced Agent tool；不修改 plugin runtime。
- **不变量：** exactly-one input；tool 不写 workspace/private document；SessionFile 只在合法 session context 下创建；不返回 absolute path identity。
- **状态或数据流：** validate -> optional ResourceIO read -> renderer -> plugin data output -> optional stageFile -> structured result。
- **错误与失败行为：** invalid_input/resource_denied/render_failed/session_unavailable/stage_failed 分类清晰；无部分文件伪造。
- **兼容要求：** PluginManager namespacing、`plugin_output` sessionPermission、SessionFile runtime context。
- **安全与隐私要求：** 不接受宿主绝对路径；resource read 只按 manifest capability；日志不含 Markdown 全文或 secrets。

## 6. 执行路线

1. 建立 input schema/互斥和 failure tests，证明错误路径。
2. 接入 T-02 renderer 与 ResourceIO read adapter，覆盖 string/ResourceRef 两条正常路径。
3. 在 session context fixture 中生成 HTML plugin-data file 并 stage；在无 session fixture 中验证显式 no-file result。
4. 标注 `plugin_output` 权限语义并确保 tool namespace/catalog 可诊断。
5. 运行 tool invocation、resource denial、stage failure 和 no-absolute-path scan，记录 Evidence。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/markdown-wechat/tools/**</Path>`、renderer/tooling 和插件内 tests。
- **可写范围：** frontmatter `writable_paths` 列出的 tools/tooling/test 路径；renderer 和 routes 只读。
- **只读上下文：** `<Path>packages/plugin-runtime/src/index.ts</Path>`、`<Path>core/plugin-manager.ts</Path>`、`<Path>examples/plugins/sdk-showcase/tools/create-note.js</Path>`、T-02 renderer、`<Path>temp/md-wechat/src/lib/renderer.js</Path>`。
- **共享路径：** 无；tool 只消费 renderer，不改变宿主 runtime。
- **保留或不动：** workspace、SessionFile core registry、host manifest schema、其它 tools。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| Markdown 正常路径 | tool invocation fixture | `npx vitest run <Path>plugins/markdown-wechat/tests/agent-render.test.ts</Path>` 输入 Markdown + session | HTML 文本和 HTML SessionFile media details | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-05.md</Path>` |
| ResourceRef 正常路径 | ResourceIO/tool integration | 输入单个 ResourceRef | 经 `ctx.resources.read` 渲染同等 HTML，无 private/workspace 写入 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-05.md</Path>` |
| 失败路径 | invalid/stage/resource fault injection | 缺失/同时输入、拒绝读取、无 session、stage 失败 | 稳定错误，不创建伪文件、不暴露绝对路径 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-05.md</Path>` |
| 回归 | tool catalog | PluginManager diagnostics/tool invocation | namespace、permission 和 renderer 复用不回归 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-05.md</Path>` |

- **Workspace checks：** Lead 在 current workspace 使用 Node 24 运行 Agent tool、ResourceRef、stageFile 测试与插件 typecheck/build/verify。
- **E2E disposition：** required：PluginManager invocation context、ResourceIO、session permission 与 SessionFile staging 是宿主集成边界。
- **E2E owner/environment：** Lead / current-workspace；宿主 tool invocation 场景覆盖 Markdown/ResourceRef、session/no-session、denial 和 stage failure。
- **Integration evidence：** 记录 implementation commit、parent before、direct-parent tool/SessionFile 集成和 result SHA。

## 9. 发布、迁移与恢复

- **迁移顺序：** 无旧数据迁移；每次输出生成独立 plugin-data file。
- **兼容窗口：** 无 session 时维持 HTML 文本降级；SessionFile schema 由宿主 runtime 管理。
- **监控信号：** tool invocation、input error、ResourceIO denial、stage success/failure；日志脱敏。
- **回滚或前向恢复：** stage 失败不返回 file identity；插件删除不影响已有 session files 的宿主管理。
- **不可逆操作与批准点：** 无 workspace mutation；plugin_output 受既有 reviewer/session 语义约束。
- **收缩条件：** AC-013～015 全部通过后交给 T-07。

## 10. 验收标准

- [ ] AC-013、AC-014、AC-015：两种输入、SessionFile/no-session、错误和纯产出边界通过；AC-008 的 Page/Widget 下载由 T-03 覆盖。
- [ ] Evidence 写入 `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-05.md</Path>`。
- [ ] 不修改用户 workspace，不接受绝对路径，不绕过 ResourceIO。
