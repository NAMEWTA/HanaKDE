# Ticket 07: 迁移 Server、Desk 与 Workbench 兼容入口

- **被阻塞于：** [`05-adapt-workspace-source-registry.md`](./05-adapt-workspace-source-registry.md)、[`06-complete-resource-io-http-seams.md`](./06-complete-resource-io-http-seams.md)
- **状态：** 已完成

## 战略与背景

- **战略：** 让 full Desk 与现有 Workbench 经来源适配器消费同一 main，同时保持旧 URL 和响应含义。
- **需求追踪：** KW-RULE-RESOURCE
- **当前现状：** desk.ts 只在 full-root 注册；mobile-workbench.ts 由 server/index.ts 单独注册。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 让 full Desk 与现有 Workbench 经来源适配器消费同一 main，同时保持旧 URL 和响应含义。 | `server/routes/desk.ts`<br>`server/routes/mobile-workbench.ts`<br>`core/mount-aware-file-service.ts` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

> 以下仅列主要交付物，不构成文件白名单或完整清单；为满足本 ticket 验收而新增/修改的同范围实现、类型、schema、fixture、测试、i18n 与文档同属交付物。

- `core/knowledge-workspace/workbench-compatibility.ts`
- `tests/desk-route.test.ts`
- `tests/mobile-workbench-route.test.ts`

## 实施时需阅读的文件

> 以下列出本 ticket 的具体代码接缝；实施前还必须按 [`README.md`](../README.md) 的文档权威关系读取 accepted [`LOG.md`](../LOG.md)、[`ADR.md`](../ADR.md)、[`CONTEXT.md`](../CONTEXT.md)、[`spec.md`](../spec.md) 及本 ticket 的固定实施契约，不能因本节或交付物未逐项复写而遗漏已确认结论。

- `server/routes/desk.ts`
- `server/routes/mobile-workbench.ts`
- `core/mount-aware-file-service.ts`

## 固定实施契约

- [`architecture.md`](../architecture.md)
- [`spec.md`](../spec.md)

## 实施顺序

1. 先以当前真实文件和公开契约建立失败测试，不访问 Engine 私有字段。
2. 实现本 ticket 的最小垂直切片，复用 ResourceIO、共享 IR、coordinator 或既有 UI 接缝。
3. 补齐取消、冲突、权限/不可用、外部变化和清理路径。
4. 运行精确自动化、相关回归、typecheck 与 boundary 检查并记录实际结果。

## 实现约束

1. 普通资源访问必须经现有 ResourceIO/provider；复合 mutation 必须经公开 coordinator 和 Operation Journal。
2. Renderer 不访问 Node 文件系统；远程 DTO、日志和 release evidence 不含绝对路径、正文或凭证。
3. 测试使用隔离临时 HANA_HOME、workspace、来源和端口，不依赖开发机固定路径或网络。
4. 实现不得引入未在 ADR/实施契约冻结的新存储引擎、IPC path surface、恢复状态或 E2E 框架。

## 自动化证据

**Primary ownership：** 无直接用户故事；按上列规则域交付

**必须创建或更新：**

- `tests/desk-route.test.ts`
- `tests/mobile-workbench-route.test.ts`

**Playwright 用户流程：** 不适用；本 ticket 使用上述 Vitest 单元、组件、契约或集成测试，不运行 Playwright；下游或发布级用户流程可继续覆盖相关行为

## 验收标准

- [x] 旧客户端契约不变；selectedAgentId 只影响授权上下文，不隐式改变 main。
- [x] `Primary ownership` 明确为无直接用户故事；本 ticket 不新增未分配的产品行为，也不替其他 ticket 兜底。
- [x] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [x] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [x] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [x] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。

## 实现交接摘要

- **主线实现提交：** `5ef59690`。
- **平台：** macOS Darwin arm64、Node `v24.16.0`、npm `11.13.0`。
- **统一 main：** `core/knowledge-workspace/workbench-compatibility.ts` 将活动 session workspace mount、session cwd 与既有 Desk fallback 映射到同一逻辑 `main`；Desk、Mobile Workbench 与 Knowledge route 共用该适配器。`selectedAgentId` 只进入授权 target，且与 legacy `agentId` 不一致时 fail-closed，不参与根选择。
- **兼容与安全：** 保留既有 Desk/Workbench URL、method 与响应含义；远程 DTO、bootstrap、文件/技能错误均隐藏本机绝对路径，远程请求不能注入显式 `dir`、上传源路径、`filePath` 或 `skillDir`。工作区技能的列举、读取、安装、删除和文件 move 预检改经 ResourceIO/provider。
- **流式内容：** ResourceIO/provider 新增 `openRead` bounded stream，支持 HEAD、ETag、Range、expected-version 与 mount root/scope 复验；每个最多 1 MiB 的 chunk 使用独立 buffer，大文件不会因复用内存而损坏。
- **替换与外部变化：** provider 内部 `replaceExisting` 在同一目标 authority 内捕获并复验版本；活动 mount 换根、撤权、目标目录缺失、来源变化与远程 provider 故障均稳定失败，不写入旧根、不泄露路径。
- **持久化清单：** 移除 Desk 直接 workspace mkdir/delete 的两个过期豁免，只保留 OS 临时 skill validation staging 清理豁免；`build/persistence-store-inventory.json` 与 compatible `build/persistence-schema-fingerprint.json` 已重生成，DATA_EPOCH 不变。
- **定向自动化：** `npx vitest run tests/desk-route.test.ts tests/mobile-workbench-route.test.ts tests/mount-aware-file-service.test.ts tests/knowledge-workspace-route.test.ts tests/resource-io-local-fs-provider.test.ts tests/resource-io-mount-provider.test.ts tests/resource-io-transfer.test.ts tests/resource-io-provider-contract.test.ts tests/resource-io-types.test.ts tests/server-composition-boundary.test.ts tests/open-boundary-lint.test.ts tests/package-build-boundary.test.ts tests/build-server-open.test.ts tests/persistence-store-registry.test.ts tests/persistence-schema-tripwire.test.ts`，15 files、165/165。
- **全仓回归：** `npm test -- --run --exclude 'temp/**' --exclude 'teach/**'`，1007 files passed、1 skipped，10092 tests passed、6 skipped。未排除时唯一失败是用户本地、已被 `.gitignore` 忽略的 `temp/HanaKDE-TodoList-Plugin-Teaching-v1.1.0` 下 8 个 `node:test` 脚本被 Vitest 当作空 suite；未修改该目录。
- **静态与构建：** `npm run typecheck`、`npm run lint:boundary`、目标 ESLint（0 errors、94 warnings）与 `git diff --check` 通过；`npm run build:packages`、`npm run build:server:open`、使用执行后删除的一次性签名密钥运行的 `npm run build:server` 均通过。
- **双轴审查：** 规范轴初审发现并推动修复多块流 buffer 复用、Desk move 直读文件系统、远程技能安装错误泄漏三项阻塞；复审 0 发现、0 阻塞。标准轴 0 硬性违规、0 阻塞，保留 Desk 安全前置与 file-content response plan 两项非阻塞重复逻辑建议。
- **交接：** `speculo/.speculo/commands/handoff/2026-07-28-openhanako-knowledge-workspace-implementation-07.md`。
