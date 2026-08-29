---
schema_version: 3
artifact: ticket
change: 2026-08-28-knowledge-explorer-convergence
id: T-01
title: 将 Knowledge 绑定到当前授权工作区
status: ready
planning_depth: deep
planning_depth_reason: 跨 Renderer、HTTP、ResourceIO 与 SourceRegistry cache，并触及本地路径和 mount 授权边界
ready: true
risk: high
blocked_by: [T-00]
contract_ids: [AC-001, AC-002, AC-003, AC-004, AC-005]
owner: root
expected_changes: ["<Path>core/knowledge-workspace/workbench-compatibility.ts</Path>", "<Path>server/routes/knowledge-workspace.ts</Path>", "<Path>desktop/src/react/services/knowledge-workspace-client.ts</Path>", "<Path>desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.tsx</Path>", "<Path>desktop/src/react/components/knowledge-workspace/KnowledgeLayout.tsx</Path>", "<Path>tests/knowledge-workspace-route.test.ts</Path>", "<Path>desktop/src/react/__tests__/services/knowledge-workspace-client.test.ts</Path>", "<Path>desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx</Path>", "<Path>build/cli-runtime-closure.json</Path>"]
writable_paths: ["<Path>core/knowledge-workspace/workbench-compatibility.ts</Path>", "<Path>server/routes/knowledge-workspace.ts</Path>", "<Path>desktop/src/react/services/knowledge-workspace-client.ts</Path>", "<Path>desktop/src/react/components/knowledge-workspace/**</Path>", "<Path>tests/knowledge-workspace-route.test.ts</Path>", "<Path>desktop/src/react/__tests__/services/knowledge-workspace-client.test.ts</Path>", "<Path>desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx</Path>", "<Path>build/cli-runtime-closure.json</Path>"]
read_only_paths: ["<Path>server/routes/desk.ts</Path>", "<Path>core/mount-aware-file-service.ts</Path>"]
shared_paths: ["<Path>desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.module.css</Path>"]
shared_path_owners: ["<Path>desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.module.css</Path> => T-02"]
---

# Ticket T-01: 将 Knowledge 绑定到当前授权工作区

## 1. 战略与来源

- **目标：** Knowledge 的 sources、ResourceIO、operations 和 watch 全部绑定当前 Desk 工作区。
- **来源：** `AC-001`—`AC-005`、用户截图与现有 Desk 路由授权合同。
- **可观察产出：** 打开本地目录或 mount 后，Knowledge 树展示同一根目录；切换工作区不会复用旧 registry/cache。

## 2. 决策状态

- selector 使用可选 `workspaceDir`、`workspaceMountId`、`workspaceLabel` 和 `workspaceAgentId` 查询参数，缺省时保留旧 session 推断。
- 本地绝对路径只允许 local-owner 且必须处于 Desk 已批准目录；mount 继续由 ResourceIO capability 校验。
- source 请求失败时保留真实错误，不伪造 `available` main source。
- 未决问题：无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| scoped client/watch、Server selector resolver、registry identity、错误状态 | Desk 授权、SourceRegistry、ResourceIO、Knowledge 状态机 | 新文件后端、跨设备同步协议、发行 |

## 4. 要构建什么

Renderer 从活动 Desk store 生成规范 selector，并让所有 Knowledge 与 ResourceIO 请求共享该上下文。Server 将 selector 解析成 main root，在读取路径前执行身份、approved-dir 和 mount capability 检查。root 改变时 registry 与 operation coordinator 必须重建。

## 5. 实现契约

- **入口：** `createKnowledgeWorkspaceClient`、Knowledge source watch、`registryFor`。
- **输入/输出：** 活动 `mountId` 或本地目录 -> 规范 main root -> 真实 source/resource DTO。
- **兼容性：** 无 selector 调用维持现有 session/default 行为；注入测试 client 不被覆盖。
- **失败行为：** selector 冲突、远端绝对路径、越界目录或未知 mount 均 fail closed；UI 显示错误且不制造来源。
- **安全：** `files` scope、local-owner 与 approved-root 不得弱化；label 只作展示。
- **缓存不变量：** selector/main-root signature 是 registry 和 operation coordinator identity 的一部分。

## 6. 执行路线

1. 添加 client 与 route 失败测试，固定查询传播、local/mount 成功、remote/越界拒绝和 cache switch。
2. 实现 selector 编码和 scoped fetch/watch。
3. 实现 Server resolver、授权与 root-aware cache。
4. 接入 `KnowledgeWorkspace`，删除失败时的假 main DTO。
5. 运行 focused tests、security regression 和 typecheck。

## 7. 路径访问契约

- **可写范围：** frontmatter `writable_paths`。
- **只读参照：** Desk route 与 mount-aware service。
- **共享路径：** `<Path>desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.module.css</Path>` 仅由 T-02 最终修改。
- **保留：** 既有 Knowledge operations/editor/trash/index 行为与所有内部签名逻辑。

## 8. 验证矩阵

| 风险 | 接缝 | 命令/步骤 | 预期结果 |
|---|---|---|---|
| selector 丢失 | client unit | focused client Vitest | Knowledge/ResourceIO/watch URL 均携带 selector |
| 授权绕过 | route tests | focused route/security Vitest | remote dir、越界 dir、无效 mount 被拒绝 |
| 跨工作区污染 | route/component | 切换 local/mount fixture | registry、watch 和 UI 加载新 root |
| 回归 | static | typecheck | TypeScript 通过 |

- **E2E disposition：** required，由 T-02 在最终 Explorer 组合状态执行。
- **E2E owner/environment：** Lead / current-workspace desktop app；T-02 在最终组合状态验证 local/mount root、树加载和工作区切换。
- **Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-28-knowledge-explorer-convergence/evidence/T-01.md</Path>`。

## 9. 发布、迁移与恢复

- **迁移：** 查询参数为后向兼容增量，无持久数据迁移。
- **监控：** source load error、403/404 selector rejection、workspace switch 后 root identity。
- **恢复：** 回滚本 Ticket 文件即可恢复 session/default 推断；不删除用户文件或索引。
- **发布：** 本 Ticket 不授权 commit、push 或 release。

## 10. 验收标准

- [ ] `AC-001`—`AC-005` 全部满足。
- [ ] local 与 mount 都加载当前工作区，切换后无旧数据污染。
- [ ] remote/越界路径测试 fail closed。
- [ ] source 失败不再伪造 available main。
- [ ] focused tests 与 typecheck 通过并记录 Evidence。
- [ ] 修改未超出 writable paths，未执行未授权 commit/push/release。
