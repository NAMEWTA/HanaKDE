---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-26
title: 闭合 Agent mutation producer correlation
status: ready
planning_depth: deep
planning_depth_reason: "同一次 Agent write/edit 必须把 ResourceIO mutation receipt、conversation operation、当前 main scope 与持久 file block 精确绑定；错误关联会造成跨 main History 泄漏或第二事实源。"
ready: true
risk: critical
blocked_by: [T-17]
contract_ids: [AC-008, AC-015, AC-016, AC-017, AC-024, AC-026]
owner: Worker-T-26 / Root Lead
expected_changes: ["<Path>lib/resource-io/pi-tool-operations.ts</Path>", "<Path>lib/sandbox/index.ts</Path>", "<Path>core/engine.ts</Path>", "<Path>core/workspace-runtime/production-workspace-runtime.ts</Path>", "<Path>lib/activity-hub.ts</Path>", "<Path>server/block-extractors.ts</Path>", "<Path>desktop/src/react/stores/agent-activity-slice.ts</Path>", "<Path>tests/**</Path>"]
writable_paths: ["<Path>lib/resource-io/pi-tool-operations.ts</Path>", "<Path>lib/sandbox/index.ts</Path>", "<Path>core/engine.ts</Path>", "<Path>core/workspace-runtime/production-workspace-runtime.ts</Path>", "<Path>lib/activity-hub.ts</Path>", "<Path>server/block-extractors.ts</Path>", "<Path>desktop/src/react/stores/agent-activity-slice.ts</Path>", "<Path>tests/resource-io-sandbox-tools.test.ts</Path>", "<Path>tests/production-workspace-runtime.test.ts</Path>", "<Path>tests/activity-hub.test.ts</Path>", "<Path>tests/engine-build-tools.test.ts</Path>", "<Path>tests/block-extractors.test.ts</Path>", "<Path>tests/sessions-route.test.ts</Path>", "<Path>tests/chat-agent-activity-event.test.ts</Path>", "<Path>tests/knowledge-workspace-e2e/fixtures/**</Path>", "<Path>tests/knowledge-workspace-e2e/specs/agent-file-changes.spec.ts</Path>"]
read_only_paths: ["<Path>lib/resource-io/resource-io.ts</Path>", "<Path>lib/resource-io/types.ts</Path>", "<Path>lib/file-history/**</Path>", "<Path>server/routes/file-history.ts</Path>", "<Path>server/routes/resource-io.ts</Path>", "<Path>shared/workspace-history.ts</Path>", "<Path>desktop/src/react/components/file-history/**</Path>", "<Path>desktop/src/react/components/chat/**</Path>", "<Path>desktop/src/react/utils/history-builder.ts</Path>", "<Path>package.json</Path>", "<Path>package-lock.json</Path>", "<Path>.github/**</Path>"]
shared_paths: ["<Path>core/engine.ts</Path>", "<Path>core/workspace-runtime/production-workspace-runtime.ts</Path>", "<Path>lib/resource-io/pi-tool-operations.ts</Path>", "<Path>lib/activity-hub.ts</Path>"]
shared_path_owners: ["<Path>core/engine.ts</Path> => T-26 / Root Lead", "<Path>core/workspace-runtime/production-workspace-runtime.ts</Path> => T-26 / Root Lead", "<Path>lib/resource-io/pi-tool-operations.ts</Path> => T-26 / Root Lead", "<Path>lib/activity-hub.ts</Path> => T-26 / Root Lead"]
---

# Ticket T-26: 闭合 Agent mutation producer correlation

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/26-close-agent-mutation-producer-correlation.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-26.md</Path>`

## 1. 战略与来源

- **目标：** 补齐 T-17 明确留下的 producer envelope，使 sandbox `write`/`edit` 只在一次成功、可证明属于当前 main 的 ResourceIO mutation 后生成严格的 Agent file-change fact。
- **可观察产出：** 当前 conversation 中由 Agent 修改的 main 文件出现既有 History action；mount、失败写、缺失 correlation、root 替换和旧 scope 保持无链接。
- **来源：** `AC-008`、`AC-015`—`AC-017`、`AC-024`、`AC-026`，以及 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-17.md</Path>` 的 producer/E2E residual。
- **当前事实：** ResourceIO 已返回 authoritative `ResourceMutationResult`，但 Pi-tool adapter 丢弃它；legacy SessionFile 事件按裸路径二次推断；ActivityHub 丢弃 `operationId`；write/edit 无 chat block extractor。

## 2. 决策状态

### 已锁定决策

- placement 为 HanaKDE system core，不是插件；producer 需要 ResourceIO、main root authority、ActivityHub 与 server serializer 的宿主权限。
- 每次 direct `write`/`edit` invocation 使用一个 UUIDv4 operation id；只有对应 `ResourceIO.write` 的唯一成功 mutation receipt 可生成 fact。
- main membership 由 production workspace runtime 在投影时重验当前 root proof，并从 mutation `resource` 生成 `{ sourceKey: "main", relativePath }`；不得从 tool args、`filePath`、`agentId` 或 cwd 推断。
- correlation 复用 T-17 已锁定的 ActivityHub + renderer-local scope generation。页面/session reload 可由同进程 ActivityHub rebroadcast 恢复；server restart 后缺失 activity 必须 fail closed，不新增 durable workspace/binding identity。
- legacy SessionFile 注册可继续提供文件卡，但不得再作为 History correlation authority；不得产生第二个 Agent History event/fact。
- T-15 保持唯一 restore writer，T-16 保持唯一 History UI/route owner；本 Ticket 不修改它们。

### 已采用的低影响假设

- 第一阶段只承诺 Pi built-in `write`/`edit`；bash、插件工具、mount/remote mutation 保留既有 operation impact，不获得 main History action。
- `agent_tool` activity 是非持久、无右侧卡的 correlation record；同进程 session reload 可重播，进程重启安全降级为无链接。
- 确定性 desktop E2E harness 必须位于测试边界，不依赖外部模型、真实账号、production-only test route 或 websocket/raw JSON 注入。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| invocation-local mutation capture、main classifier、ActivityHub operation correlation、write/edit file block、同进程 reload 与定向 direct flow | ResourceIO.write/result/event、T-17 strict parser/projector、T-16 modal/client、T-15 restore | bash/plugin/mount History、durable workspace id/binding、Agent store/watcher/route、History/restore API 改造、package/platform Gate |

## 4. 要构建什么

Agent 对 main 文件执行 `write` 或 `edit` 时，sandbox 在调用开始冻结 session identity 与 operation id。Pi-tool adapter 把该 id 传入 ResourceIO，并只捕获实际成功的 mutation result。Engine 经当前 production main authority 重验后生成严格 fact，同时在既有 ActivityHub 写入同 operation correlation。tool result 的 SessionFile file block携带该 fact；live chat 与 `/sessions/messages` 重建走同一 block extractor。T-17 consumer 随后只在当前 conversation/main scope 显示 T-16 History action。

## 5. 实现契约

- **入口或接缝：** `createResourceIoToolOperations` invocation capture、`wrapFileTouchTool`、production main projector、ActivityHub、`extractBlocks`。
- **输入与输出：** session snapshot + UUIDv4 + one successful `ResourceMutationResult` -> optional strict `AgentFileChangeFact` + existing SessionFile block。
- **公共接口变化：** 仅进程内 additive callback/return seam；不新增 renderer/server public route、schema、workspace id 或 raw root。
- **不变量：** zero/multiple receipts no fact；fact and activity share exact session/operation；main proof first；mount/remote no History；no path fallback；no second writer/watcher/store。
- **状态或数据流：** invocation AsyncLocalStorage -> ResourceIO mutation -> main revalidation -> ActivityHub correlation -> tool-result details -> live/replay block -> T-17 projection。
- **错误与失败行为：** write throw/failure、missing session、missing hub、unhealthy/stale root、root replacement、invalid descriptor、duplicate receipt 均保留普通 tool/session output但省略 fact；不得把 producer metadata 失败改写成文件写入失败。
- **兼容要求：** 保留 SessionFile/writableLocalRef 与 legacy file card；未知字段仍由 T-17 closed parser拒绝；server restart 后旧 fact因无 activity correlation不显示。
- **安全与隐私要求：** envelope 仅含 opaque session id、UUID operation id、source-relative address；不序列化绝对路径、root identity、historyStoreKey、scope token、agent id或文件内容。

## 6. 执行路线

1. 用 sandbox red test固定成功 receipt、失败、multiple receipt、参数路径与 authoritative resource不一致行为。
2. 增加 invocation-local capture并把 operation id传入现有 ResourceIO context；只返回唯一成功 receipt。
3. 在 production runtime增加 main-only projector，并覆盖 unhealthy/root-replaced/mount拒绝。
4. Engine在成功 main projection后原子地产生 ActivityHub correlation与 strict fact；ActivityHub保留 operation id且不持久、不渲染卡。
5. 为 write/edit复用 SessionFile file block extractor，验证 live与 `/sessions/messages` replay同构。
6. 以无外部模型的真实 Engine buildTools integration先闭合 producer；只有确定性 desktop harness确实调用同一生产链时才解除 E2E fixed skip。

## 7. 路径访问契约

- **预计修改点：** frontmatter `expected_changes`。
- **可写范围：** 仅 frontmatter `writable_paths`；测试 fixture仅可增加测试边界，不得增加 production-only route或绕过 Engine。
- **只读上下文：** T-15/T-16/T-17 domain/UI/routes、ResourceIO public kernel、package/CI。
- **共享路径：** `core/engine.ts`、production runtime、Pi-tool adapter与ActivityHub由 T-26/Root Lead串行拥有。
- **保留或不动：** file-history store/service、restore implementation、watcher/baseline、mount provider、shared strict fact shape。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| authoritative producer | sandbox + Engine buildTools tests | write/edit main、mutation resource与arg不一致 | 只按成功 receipt生成一条 fact/activity | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-26.md</Path>` |
| fail-closed scope | production runtime + ActivityHub tests | unhealthy/root replace/mount/missing/multiple/restart | 无 fact/link、无raw fallback或持久 correlation | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-26.md</Path>` |
| live/replay serializer | block extractor + sessions route | live tool result与session reload | 同一 strict fact随对应 file block重建 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-26.md</Path>` |
| owner E2E | desktop-full isolated fixture | Agent write/edit -> reload -> History diff/restore/readback | current main显示并复用T-16/T-15；mount/stale无链接 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-26.md</Path>` |
| regression | focused suites + typecheck/lint/build | T-17/T-16/ResourceIO/ActivityHub/chat | 既有契约绿色、无duplicate owner | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-26.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** red contract -> capture -> main projector -> activity/fact -> serializer -> E2E。
- **兼容窗口：** additive details/activity字段可被旧 consumer忽略；不迁移旧 session，也不回填历史事实。
- **监控信号：** unique receipt count、main projection rejection、missing activity correlation、T-17 link count。
- **回滚或前向恢复：** 可移除 optional fact/activity而保留 ResourceIO写入与SessionFile卡；禁止以raw path fallback恢复链接。
- **不可逆操作与批准点：** 无数据迁移/外部写；本地 commit/Lead local merge按Goal Plan既有授权，push/PR/release/archive禁止。
- **收缩条件：** Agent store/watcher/restore route、durable workspace binding、raw root/path authority和第二 mutation event/fact均为零。

## 10. 验收标准

- [ ] `AC-008`：同 conversation/operation 的 main `write`/`edit` 才获得共享 History；mount/remote只保留operation impact。
- [ ] `AC-015`—`AC-017`：producer只链接现有T-16/T-15 flow，restore/convergence无第二写入口。
- [ ] `AC-024`：Workspace/Agent UI语义仍分离，底层共享，server restart与scope变化fail closed。
- [ ] `AC-026`：无raw root/public workspaceId/绝对路径或私有identity进入fact/activity/public响应。
- [ ] unique/failed/multiple/root-replaced/mount/reload矩阵与focused regression绿色。
- [ ] owner E2E只有在无外部模型、真实调用production write/edit链时才可解除skip；否则Ticket保持`review`且T-25继续blocked。
- [ ] 实际修改不越过`writable_paths`，Evidence与双轴review完整。
