---
schema_version: 3
artifact: ticket
change: 2026-08-13-markdown-wechat-plugin
id: T-04
title: 交付 ResourceIO 导入与显式版本写回
status: ready
planning_depth: deep
planning_depth_reason: 涉及用户资源权限、ResourceRef 输入、版本冲突和数据完整性；写回是显式且不可静默覆盖的高风险边界。
ready: true
risk: high
blocked_by: [T-01]
contract_ids: [AC-007, AC-010, AC-014]
owner: root
expected_changes: ["<Path>plugins/markdown-wechat/routes/resource-io.ts</Path>", "<Path>plugins/markdown-wechat/src/resources/**</Path>", "<Path>plugins/markdown-wechat/src/components/resources/**</Path>", "<Path>plugins/markdown-wechat/tests/resource-io.test.ts</Path>"]
writable_paths: ["<Path>plugins/markdown-wechat/routes/resource-io.ts</Path>", "<Path>plugins/markdown-wechat/src/resources/**</Path>", "<Path>plugins/markdown-wechat/src/components/resources/**</Path>", "<Path>plugins/markdown-wechat/tests/resource-io.test.ts</Path>"]
read_only_paths: ["<Path>packages/plugin-runtime/src/index.ts</Path>", "<Path>packages/plugin-protocol/src/index.ts</Path>", "<Path>server/routes/resource-io.ts</Path>", "<Path>desktop/src/react/services/knowledge-workspace-client.ts</Path>", "<Path>plugins/markdown-wechat/manifest.json</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-04: 交付 ResourceIO 导入与显式版本写回

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/ticket/04-deliver-resource-import-and-explicit-writeback.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-04.md</Path>`

## 1. 战略与来源

- **目标：** 让 Page 通过 `resource.pick` 选择 Markdown 资源，服务端经 `ctx.resources.read` 导入；用户另行选择目标后，以版本保护显式写回工作区。
- **可观察产出：** 成功导入替换 private active document 并标记 dirty；选择/读取拒绝保留旧草稿；写回只有 `writeExpectedVersion` 成功才修改目标，冲突/拒绝时目标和草稿均保留。
- **来源：** US-004、US-008、AC-007、AC-009、AC-010、AC-014、ADR-003、`<Path>packages/plugin-runtime/src/index.ts</Path>`。
- **当前事实：** `hana.resources.pick()` 是 UI host request；实际内容读取/写入走 plugin runtime `ctx.resources`，ResourceRef 支持 local-file/mount/resource/session-file/url。
- **Planning Depth 原因：** 用户数据完整性和权限边界属于 Deep；需要故障注入、版本冲突、无绝对路径和显式批准点。

## 2. 决策状态

### 已锁定决策

- 只接受 Markdown 文本类输入；不能读取或解析宿主绝对路径。
- 导入不会隐式覆盖工作区；写回必须另行选择目标并携带适用版本。
- 失败 fail closed：旧草稿和目标资源不变，错误可恢复且脱敏。

### 已采用的低影响假设

- `resource.pick` 返回的 ResourceRef 可以由同插件 route/tool 传递给 `ctx.resources.read`；若宿主返回不完整 ref，显示资源失败。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| picker action、read adapter、text validation、target picker、writeExpectedVersion、conflict UI/tests | Hana ResourceIO、ResourceRef、surface session、T-01 private store | raw fs workspace access、automatic writeback、directory/multi-select、URL upload |

## 4. 要构建什么

用户点击导入，选择单个 `.md`/`.markdown`/`.txt` ResourceRef。插件读取 bytes/text，验证为可处理 Markdown 后才替换 active document；读取拒绝、空/二进制或不支持格式时不改变现有草稿。用户点击写回，再选择目标 ResourceRef 并确认当前版本；成功调用 `ctx.resources.writeExpectedVersion`，冲突或权限错误不重试覆盖，保留源草稿并给出重新选择/确认入口。Agent 的 ResourceRef 输入复用同一 read adapter，但不触发 private document 或 workspace write。

## 5. 实现契约

- **入口或接缝：** `hana.resources.pick`、plugin route request context、`ctx.resources.read`、`ctx.resources.writeExpectedVersion`、ResourceIO fixtures。
- **输入与输出：** ResourceRef + optional expectedVersion -> imported Markdown/private state or mutation/conflict result。
- **公共接口变化：** 仅插件内部 routes/tool input；不新增宿主 resource API。
- **不变量：** 所有用户资源操作经 ResourceIO；writeExpectedVersion 冲突 fail closed；private data 与 workspace resource 不混淆。
- **状态或数据流：** pick -> ref validate -> read -> decode/validate -> private save; target pick -> version snapshot -> explicit confirm -> expected write.
- **错误与失败行为：** permission denied/not found/not text/conflict/storage failure 分类可见；不写部分内容、不接受绝对路径。
- **兼容要求：** ResourceIO provider/ref/version 合同；远程和本地连接均依赖宿主授权。
- **安全与隐私要求：** 不记录完整文本、token、绝对路径；写回动作必须是用户显式事件。

## 6. 执行路线

1. 建立 ResourceRef read/write adapter 测试，先让拒绝/冲突场景变红。
2. 接入 picker 和 route read，完成文本解码、Markdown 扩展名/内容校验和 private save。
3. 接入目标选择、版本快照、确认和 `writeExpectedVersion`，实现 conflict UI。
4. 覆盖 Agent ResourceRef read-only 使用，确保不改变 private document。
5. 运行 local/mount/read-denied/conflict/absolute-path policy tests，记录 Evidence。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/markdown-wechat/routes/**</Path>`、`<Path>plugins/markdown-wechat/src/resources/**</Path>` 和插件内 tests。
- **可写范围：** frontmatter `writable_paths` 列出的 resource route/adapter/UI/test 路径；其它插件路径只读。
- **只读上下文：** `<Path>packages/plugin-runtime/src/index.ts</Path>`、`<Path>packages/plugin-protocol/src/index.ts</Path>`、`<Path>server/routes/resource-io.ts</Path>`、`<Path>desktop/src/react/services/knowledge-workspace-client.ts</Path>`、T-01 plugin store。
- **共享路径：** 无；本 Ticket 不改变公共 ResourceIO。
- **保留或不动：** 用户 workspace、宿主 resource routes、根依赖和其它插件。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常导入 | ResourceIO integration | `npx vitest run <Path>plugins/markdown-wechat/tests/resource-io.test.ts</Path>` | picker ref 经 read 后替换 active doc 并 dirty | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-04.md</Path>` |
| 读取失败 | read-denied/not-text fixture | 同一测试拒绝、二进制、错误扩展名 | 旧草稿不变，错误可见 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-04.md</Path>` |
| 正常写回 | expected-version integration | 选择目标并确认 | 仅成功版本写入改变目标 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-04.md</Path>` |
| 冲突/安全回归 | conflict + absolute-path scan | 修改目标版本后写回；传绝对路径参数 | fail closed，目标/草稿保留，无 raw fs | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-04.md</Path>` |

- **Workspace checks：** Lead 在 current workspace 使用 Node 24 运行 ResourceIO 正常/拒绝/冲突测试、插件 typecheck/build/verify 和定向宿主 ResourceIO 回归。
- **E2E disposition：** required：surface picker、route、ResourceIO 权限与 expected-version 写回跨越 iframe/server/resource 边界。
- **E2E owner/environment：** Lead / current-workspace；真实或宿主 fixture 中验证选择、导入、拒绝、显式写回与版本冲突。
- **Integration evidence：** 记录 implementation commit、parent before、direct-parent ResourceIO 集成/E2E 和 result SHA。

## 9. 发布、迁移与恢复

- **迁移顺序：** 不迁移旧数据；显式 Markdown 文件导入是唯一文章迁移路径。
- **兼容窗口：** ResourceRef version 字段缺失时只能执行读取或要求重新 stat；禁止盲写。
- **监控信号：** resource operation category、conflict count、read/write denial；日志脱敏。
- **回滚或前向恢复：** writeExpectedVersion 失败不改目标；成功写回的后续恢复依赖 ResourceIO 历史，不在插件内伪造回滚。
- **不可逆操作与批准点：** 每次 workspace write 都需要用户显式确认；无自动批量写回。
- **收缩条件：** AC-007/010/014 与安全扫描通过后才能纳入最终发布。

## 10. 验收标准

- [ ] AC-007、AC-010、AC-014：导入、显式写回和 ResourceRef 安全边界通过；AC-009 由 T-02/T-03 的 renderer/media Evidence 覆盖。
- [ ] 所有 ResourceIO 正常/拒绝/冲突证据写入 `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-04.md</Path>`。
- [ ] 不访问绝对路径，不绕过 ResourceIO，不发生隐式 workspace write。
