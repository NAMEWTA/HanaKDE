---
schema_version: 3
artifact: ticket
change: 2026-08-13-markdown-wechat-plugin
id: T-07
title: 汇合并发布 Markdown 公众号排版内置插件
status: ready
planning_depth: deep
planning_depth_reason: 汇合六张跨 UI、ResourceIO、Agent、策略和构建 Ticket，包含高风险发布、路径审计、删除回滚和完整验收合同。
ready: true
risk: critical
blocked_by: [T-02, T-03, T-04, T-05, T-06]
contract_ids: [AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011, AC-012, AC-013, AC-014, AC-015, AC-016, AC-017, AC-018]
owner: root
expected_changes: ["<Path>plugins/markdown-wechat/**</Path>", "<Path>speculo/.speculo/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-07.md</Path>"]
writable_paths: ["<Path>plugins/markdown-wechat/**</Path>"]
read_only_paths: ["<Path>package.json</Path>", "<Path>package-lock.json</Path>", "<Path>core/**</Path>", "<Path>server/**</Path>", "<Path>desktop/**</Path>", "<Path>scripts/**</Path>", "<Path>tests/**</Path>", "<Path>examples/plugins/**</Path>", "<Path>temp/md-wechat/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-07: 汇合并发布 Markdown 公众号排版内置插件

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/ticket/07-release-integrated-markdown-wechat-plugin.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-07.md</Path>`

## 1. 战略与来源

- **目标：** 汇合 T-02～T-06 的插件内实现，证明 AC-001～AC-018 全部满足，并形成可构建、可诊断、可删除的内置插件发布落点。
- **可观察产出：** Hana 构建/类型/插件测试通过；Page/Widget、渲染、复制、浏览器下载、ResourceIO、Agent SessionFile、策略和 diagnostics 均有 Evidence；删除插件后系统仍可构建/启动。
- **来源：** 全部 US/AC、ADR-001～ADR-006、T-01～T-06、`<Path>skills2set/hana-plugin-creator/SKILL.md</Path>`。
- **当前事实：** 根依赖和宿主构建通配已有；产品实现只能位于插件根，T-07 是最终插件根 owner，但不得修宿主或根脚本。
- **Planning Depth 原因：** 高事故半径发布汇合和不可逆安装边界，需要 Deep 的回滚、批准和完整验证。

## 2. 决策状态

### 已锁定决策

- 只有 T-01～T-06 Evidence 完整且 Ticket 状态均为 done 后才能运行 T-07。
- 任何宿主/根依赖/公共测试需求均停止并走 deviation control，不在发布票中偷偷扩大范围。
- 发布阻塞硬门是插件加载/删除、核心渲染/复制、ResourceIO 安全和 Agent 产出；主题数量差异可作为非阻塞残余风险，但不得掩盖合同失败。

### 已采用的低影响假设

- 现有仓库命令 `npm run build:server`、`npm run build:client`、`npm run typecheck`、`npm test` 可在实现后执行；若环境缺少浏览器/依赖，必须记录阻塞证据而非标记通过。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 插件内最终修复、集成测试、manifest/assets 校准、完整构建和删除 smoke、Evidence | T-01～T-06 产物、宿主命令、PluginManager/ResourceIO/SessionFile 现有接缝 | 宿主 API、根 package/lock、第三方图床、旧数据迁移、远程发布/提交 |

## 4. 要构建什么

按 DAG 读取前序 Evidence，运行 renderer/unit、surface/browser E2E、ResourceIO/tool integration、policy/diagnostics 和构建回归。若发现插件内缺陷，可在 `<Path>plugins/markdown-wechat/**</Path>` 内修复并重跑相关合同；若发现宿主接缝或范围变化，立即停止、记录 deviation 并回到上游 Work。最终在隔离副本移除插件目录，证明 HanaKDE 不依赖该插件才能构建/启动。

## 5. 实现契约

- **入口或接缝：** plugin tests、Playwright browser surfaces、Plugin Dev diagnostics/scenario、ResourceIO fixtures、tool invocation、npm build/typecheck/test。
- **输入与输出：** T-01～T-06 implementation + commands -> complete acceptance evidence and release-ready plugin tree。
- **公共接口变化：** 无；只发布插件贡献。
- **不变量：** 所有产品修改在插件根；Page/Widget 下载不注册 SessionFile；Agent tool 不写 workspace；无网络/旧迁移；失败可观察。
- **状态或数据流：** prior tickets -> integrated plugin -> focused tests -> full regression -> removal smoke -> release evidence。
- **错误与失败行为：** 任一硬门失败保持 Ticket review/blocked；不得以视觉快照或未执行测试替代宿主/安全证据。
- **兼容要求：** 当前 Hana PluginManager、SDK、Chromium、build/seed conventions。
- **安全与隐私要求：** no raw fs workspace, no absolute-path input, no third-party network, no secrets in plugin assets/logs。

## 6. 执行路线

1. 核对 T-01～T-06 状态和 Evidence，冻结当前插件根 diff 与环境版本。
2. 运行插件内 unit/integration/browser tests，按失败类别只修插件根内问题。
3. 运行 `npm run typecheck`、`npm test`、`npm run build:server`、适用 client build，验证 plugin runtime/assets 收录。
4. 运行 Plugin Dev diagnostics/scenarios 和完整 Page/Widget smoke，检查下载/SessionFile 交付边界。
5. 在隔离副本删除 plugin dir，运行 build/start/unresolved import smoke；记录所有命令输出、残余风险和路径审计。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/markdown-wechat/**</Path>`；Evidence 写入 SpecDev 状态根不属于产品实现路径。
- **可写范围：** `<Path>plugins/markdown-wechat/**</Path>`。
- **只读上下文：** `<Path>package.json</Path>`、`<Path>package-lock.json</Path>`、`<Path>core/**</Path>`、`<Path>server/**</Path>`、`<Path>desktop/**</Path>`、`<Path>scripts/**</Path>`、`<Path>tests/**</Path>`、`<Path>examples/plugins/**</Path>`、`<Path>temp/md-wechat/**</Path>`。
- **共享路径：** 无；T-07 是最终插件根集成 owner，宿主和根文件只读。
- **保留或不动：** 其它用户改动、其它 change 工件、远程系统和安装目录。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 插件行为 | T-01～T-06 focused tests | 按前序 Evidence 重跑失败/正常矩阵 | AC-001～015 全部通过 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-07.md</Path>` |
| 宿主回归 | existing plugin/core tests | `npm test` 或适用定向集 | 既有 PluginManager/ResourceIO/SessionFile 合同保持 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-07.md</Path>` |
| 构建 | server/client/typecheck | `npm run typecheck`; `npm run build:server`; `npm run build:client` | plugin runtime/assets 可解析并收录 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-07.md</Path>` |
| Browser E2E | Page/Widget/clipboard/download | Playwright desktop + narrow smoke | 无重叠，复制/下载状态准确 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-07.md</Path>` |
| Removal/release | isolated plugin deletion | 复制临时工作树，删除 plugin dir，build/start | HanaKDE 仍可构建启动，无 unresolved plugin import | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-07.md</Path>` |

- **Workspace checks：** Lead 在 current workspace 使用 Node 24 重跑插件 verify、宿主定向回归、根 typecheck、server/client build 与路径审计。
- **E2E disposition：** required：最终发布门必须覆盖真实 Page/Widget、clipboard/download、ResourceIO、Agent SessionFile、diagnostics 和 removal。
- **E2E owner/environment：** Lead / current-workspace；所有前票 done 后运行 desktop/narrow host E2E 与隔离删除 build/start smoke。
- **Integration evidence：** 记录最终 implementation commit、parent before、direct-parent 全量 Gate、result SHA、父分支包含关系和未运行项。

## 9. 发布、迁移与恢复

- **迁移顺序：** 无旧数据迁移；插件 private envelope 仅按 T-01 schema 初始化/恢复。
- **兼容窗口：** 发布前保留浏览器下载和 Agent no-session HTML fallback；不存在宿主 SessionFile UI 兼容承诺。
- **监控信号：** plugin load/diagnostics、renderer/copy/download/resource/tool errors、build/removal status。
- **回滚或前向恢复：** 移除插件目录回滚产品能力；已有用户资源和 Agent SessionFile 由宿主管理；私有数据不自动迁移。
- **不可逆操作与批准点：** 不提交、推送、安装或远程发布；任何超出插件根的修复必须用户批准并重新规划。
- **收缩条件：** 全部硬门 Evidence、路径审计、用户验收完成后才可进入 change completion/archive。

## 10. 验收标准

- [ ] AC-001～AC-018 全部覆盖并记录到 `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-07.md</Path>`。
- [ ] 构建/typecheck/test/browser/removal 命令结果可复现，未用 skipped 代替通过。
- [ ] 产品修改未超出 `<Path>plugins/markdown-wechat/**</Path>`；无未批准偏差。
