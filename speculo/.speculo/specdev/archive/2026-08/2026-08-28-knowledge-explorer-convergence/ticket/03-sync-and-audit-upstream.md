---
schema_version: 3
artifact: ticket
change: 2026-08-28-knowledge-explorer-convergence
id: T-03
title: 同步并审计 upstream v0.450.0
status: done
planning_depth: deep
planning_depth_reason: 涉及 fork 拓扑、1773 个文件差异和跨层运行代码归属判定
ready: true
risk: high
blocked_by: [T-02]
contract_ids: [AC-013]
owner: root
expected_changes: ["<Path>project runtime and build paths identified by fixed-point audit</Path>"]
writable_paths: ["<Path>project runtime and build paths approved by the AC-013 classification ledger</Path>"]
read_only_paths: ["<Path>speculo/.speculo/specdev/archive/**</Path>", "<Path>pnpm-lock.yaml</Path>", "<Path>pnpm-workspace.yaml</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-03: 同步并审计 upstream v0.450.0

## 1. 战略与来源

- **目标：** 以 upstream `v0.450.0` 为基准收敛 fork，不重构上游已有能力。
- **来源：** 用户要求全面清理并尽可能复用 upstream。
- **可观察产出：** clean upstream delta 被直接复用，重复/否决实现被删除，Hana 增强有路径级分类记录。

## 2. 决策状态

- 以 `b348cf1b` 和 `upstream/main@1d3ef308` 为固定点。
- 使用 `UPSTREAM_REUSE`、`HANA_DELTA`、`DUPLICATE`、`EXPERIMENT_RETIRED`、`HISTORY_ONLY` 分类。
- named merge 会产生 commit，等待独立授权；当前只应用无冲突的 upstream runtime 文件。
- 保留品牌、Todo、内部 seed/OTA 与无系统发行签名策略。
- 未决问题：named merge、版本线和 release digest 冲突需在提交授权后处理。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| upstream runtime delta、Knowledge 重复 UI、失效 E2E/CI 分流 | upstream model/provider、Desk/Preview、现有测试门禁 | 品牌重命名、用户 pnpm 文件、历史 evidence 改写、未授权发布 |

## 4. 要构建什么

形成路径级 ledger；应用可证明无 Hana 修改的 upstream 文件；将 Knowledge 主页面收敛为共享 Desk/Preview；删除平行组件、测试、E2E 与孤立通知链；保留有真实消费者的 Knowledge backend 和 Markdown 菜单。

## 5. 实现契约

- **固定点：** fork base `b348cf1b`、upstream `1d3ef308`、起始 branch `dc8ef720`。
- **复用规则：** 自 base 后 Hana 未修改且 upstream 改变的文件可 byte-for-byte 采用 upstream。
- **删除规则：** 必须证明生产入口无消费者，或功能已被 shared owner 完整替代。
- **保留规则：** 品牌、Todo、Knowledge backend、内部 artifact 签名和系统无发行签名策略有明确合同。
- **失败行为：** 不确定归属的路径保持不动并记录 pending，不作批量回退。
- **完整性：** archive/release evidence 不冒充 runtime，也不为通过测试而篡改。

## 6. 执行路线

1. 固定 merge-base/upstream SHA 并做三点 diff census。
2. 应用 clean upstream runtime delta。
3. 删除两个否决插件和孤立 capability。
4. 收敛 Knowledge 到 shared Desk/Preview，清理不可达 UI/test/E2E。
5. 跑 full tests、E2E、typecheck、lint 和 signed-seed local build。
6. 获得授权后执行 named merge、冲突审计和提交集成。

## 7. 路径访问契约

- **可写范围：** 仅 Evidence ledger 已分类并由相应 Ticket 覆盖的 runtime/build/test 路径。
- **只读范围：** archive、release history、`pnpm-lock.yaml`、`pnpm-workspace.yaml`。
- **共享范围：** T-00/T-02 拥有插件与 Knowledge 删除；T-03 只记录分类和 clean upstream reuse。
- **保护：** 不读取、不生成、不提交真实签名私钥。

## 8. 验证矩阵

| 风险 | 接缝 | 命令/步骤 | 预期结果 |
|---|---|---|---|
| upstream 漏吸收 | fixed-point diff | `git diff`/path ledger | clean runtime delta 已应用 |
| Hana 增强误删 | full regression | `npm test` | 全仓通过 |
| shared UI 不可用 | desktop E2E | E2E-KW-026 | tree/open/edit/save/context menu 通过 |
| 平台组合漂移 | Playwright | desktop/web-open/web-full | 全部适用场景通过 |
| 打包回归 | build | client + 临时内部签名 server build | 通过且临时 key 被删除 |

- **E2E disposition：** required。
- **E2E owner/environment：** Lead / current-workspace isolated Electron Desktop、Web Open 与 Web Full fixtures。
- **Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-28-knowledge-explorer-convergence/evidence/T-03.md</Path>`。

## 9. 发布、迁移与恢复

- **迁移：** 无用户数据迁移；删除的是仓库实现，plugin-data 保留。
- **监控：** full test、PluginManager inventory、renderer/server build、真实 E2E。
- **恢复：** 未提交工作区可按路径审阅；named merge 前不改变分支拓扑。
- **发布：** 未授权 commit/push/release；内部 seed/OTA 签名合同保持强制。

## 10. 验收标准

- [x] fixed-point 和路径分类 ledger 完成。
- [x] clean upstream runtime delta 应用并通过测试。
- [x] 重复 Knowledge UI/test/E2E 与否决插件清理。
- [x] full tests、typecheck、lint、client/server build 和三组合 E2E 通过。
- [x] Hana 明确增强及用户 pnpm 文件保留。
- [x] 后续独立授权已取得；分类收敛与 direct-parent integration 完成于 `b0c74282`，无未决冲突。
