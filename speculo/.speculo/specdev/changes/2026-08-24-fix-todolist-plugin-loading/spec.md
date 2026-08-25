---
schema_version: 3
artifact: spec
change: 2026-08-24-fix-todolist-plugin-loading
status: ready
ready_for_tickets: false
sources:
  - "USER-DECISION:按已确认计划直接实施 Todo 插件加载修复"
  - "DIAGNOSIS:真实宿主 Page API 403 与 ready 协议不匹配"
---

# Spec: 修复 Todo 插件 Page 加载与鉴权

- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-24-fix-todolist-plugin-loading/spec.md</Path>`
- **当前 ADR：** 不适用；复用既有官方插件 SDK 与归档 Todo 架构决策。
- **当前领域上下文：** 不适用；不改变 Todo 领域模型。

## 1. 问题与目标

Todo Page 未接入官方 iframe SDK，导致 API 请求丢失 surface session 并返回 403，同时 ready 消息不符合宿主协议。目标是在不改变 Todo 数据和领域行为的前提下恢复 Page 握手、鉴权和手动 CRUD。

## 2. 解决方案与外部行为

Page 入口使用官方 `@hana/plugin-sdk` 并注入浏览器应用。应用只通过 SDK 访问插件 API、发送 ready/resize 和调用宿主能力。首次页面壳渲染后立即 ready，数据错误由插件页面自身呈现。缺少 surface session 时不得退化为无凭证 fetch；构建缺依赖时不得生成退化资产。

## 3. 用户故事

- **US-001**：作为 HanaAgent 用户，我希望打开 Todo 页后立即看到可用页面并完成 CRUD，以便正常管理任务。

## 4. 验收合同

| ID | 前置条件 | 动作或事件 | 可观察结果 | 验证接缝 |
|---|---|---|---|---|
| DS-001 | 宿主签发有效 surface session | 打开 Todo Page | 收到正式 `hana.ready`，外层 spinner 不依赖超时兜底 | 构建产物协议测试、真实 iframe E2E |
| DS-002 | Todo Page 已打开 | 页面读取 Todo API | 请求携带 surface-session header，不出现 401/403 | 真实宿主 E2E |
| DS-003 | Store 可写 | 创建、编辑、完成、移入废纸篓并恢复 | 列表和详情反映每次操作 | 五语言 desktop/narrow E2E |
| DS-004 | SDK 或数据请求失败 | Page 已渲染 | 插件自身显示可重试错误，不被宿主 spinner 永久遮挡 | 生命周期合同测试、E2E |
| DS-005 | 修复完成 | 执行插件回归 | 现有 Node 测试、类型与 package smoke 通过 | 插件验证命令 |

## 5. 范围

### IN

- `<Path>plugins/todolist/src/ui/**</Path>`、`<Path>plugins/todolist/tests/**</Path>`、`<Path>plugins/todolist/assets/page.js</Path>`。
- `<Path>plugins/todolist/build.ts</Path>`、`<Path>plugins/todolist/package.json</Path>`、`<Path>plugins/todolist/manifest.json</Path>`、`<Path>plugins/todolist/CHANGELOG.md</Path>` 和插件内类型声明。

### REUSE

- `<Path>packages/plugin-sdk/src/index.ts</Path>` 的 `hana` SDK。

### OUT

- **OOS-001**：不修改 `<Path>desktop/**</Path>`、`<Path>server/**</Path>`、`<Path>core/**</Path>` 或根锁文件。
- **OOS-002**：不修改用户 Todo 私有数据。
- **OOS-003**：TaskRegistry backend unavailable 另行处理。

## 6. 已锁定实现约束

- **DEC-001**：产品写入唯一 owner 为 Lead，唯一根为 `<Path>plugins/todolist/**</Path>`。
- **DEC-002**：官方 SDK 是 Page 鉴权与宿主消息的单一实现，不复制 wire protocol。
- **DEC-003**：构建缺依赖时 fail closed，不生成普通 fetch 的 fallback bundle。
- **DEC-004**：用户已批准 Direct Spec 实施，但未授权 commit、push、部署或发布。

## 7. 数据、接口与兼容

- **公共接口变化：** 无；改为正确消费既有插件 SDK。
- **数据模型与持久化：** 无变化。
- **兼容要求：** 保持插件 ID `todolist`、Store v2 和 route/tool 合同。
- **迁移要求：** 无。
- **发布或运维影响：** 仓库验证后更新当前用户插件副本并重启，不修改 Store。

## 8. 非功能要求

- **NFR-001 安全与隐私：** 凭证仅由 SDK 从 iframe URL 读取并写入 surface-session header，不写日志或工件。
- **NFR-002 性能与容量：** 本地首屏不依赖 5 秒 timeout；不增加轮询。
- **NFR-003 可用性与可靠性：** API 失败仍显示插件错误和重试界面。
- **NFR-004 可观测性与运营：** E2E 对 401/403 和 CRUD 结果做明确断言。

## 9. 验证策略

| 接缝 | 层级 | 覆盖合同 | 现有先例或命令 | Evidence 类型 |
|---|---|---|---|---|
| Page bundle/SDK | contract | DS-001、DS-002、DS-004 | `<Path>plugins/todolist/tests/contract.test.ts</Path>` | red/green command |
| Todo application | regression | DS-003、DS-005 | `npm test`、`npm run typecheck` | command result |
| Build/package | package | DS-001、DS-002、DS-005 | `npm run build`、package smoke | artifact checks |
| Real Hana Page | E2E | DS-001～DS-004 | `<Path>plugins/todolist/tests/e2e/real-host.spec.ts</Path>` | Playwright result |

## 10. 风险、假设与未决问题

### 风险

运行中的用户插件副本与仓库资产不同；最终运行验证必须更新副本且保留 Store。

### 已采用的低影响假设

当前官方 SDK 和宿主 surface-session 接口保持兼容；已由当前运行端点验证。

### 未决问题

无。
