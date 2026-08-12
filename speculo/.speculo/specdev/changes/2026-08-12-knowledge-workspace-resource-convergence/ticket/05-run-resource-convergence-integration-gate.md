---
schema_version: 3
artifact: ticket
change: 2026-08-12-knowledge-workspace-resource-convergence
id: T-05
title: 建立资源收敛跨层回归与用户流程 Gate
status: done
planning_depth: deep
planning_depth_reason: "汇合 owner、dialog、tree、open policy、clipboard 和 event scope 的跨层共享核心验证；UI 交互需要 E2E，失败分类和多环境 capability matrix 具有较高事故半径。"
ready: true
risk: high
blocked_by: [T-01, T-02, T-03, T-04]
contract_ids: [AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011, AC-013]
owner: current-implementer
expected_changes: ["<Path>tests/knowledge-workspace-resource-convergence.test.ts</Path>", "<Path>tests/knowledge-workspace-e2e/specs/resource-convergence.spec.ts</Path>", "<Path>desktop/src/react/__tests__/components/KnowledgeResourceTree.integration.test.tsx</Path>"]
writable_paths: ["<Path>tests/knowledge-workspace-resource-convergence.test.ts</Path>", "<Path>tests/knowledge-workspace-e2e/specs/resource-convergence.spec.ts</Path>", "<Path>desktop/src/react/__tests__/components/KnowledgeResourceTree.integration.test.tsx</Path>"]
read_only_paths: ["<Path>core/engine.ts</Path>", "<Path>server/routes/knowledge-workspace.ts</Path>", "<Path>server/routes/resource-io.ts</Path>", "<Path>desktop/src/react/components/knowledge-workspace/**</Path>", "<Path>desktop/src/react/services/knowledge-workspace-client.ts</Path>", "<Path>docs/upstream-sync-ledger.md</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-05: 建立资源收敛跨层回归与用户流程 Gate

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/05-run-resource-convergence-integration-gate.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>`

## 1. 战略与来源

- **目标：** 在 T-01 至 T-04 完成后，以真实公共 composition 和用户流程证明 Knowledge 资源事实、交互、能力降级、scope/event 和既有 Workbench 语义已收敛。
- **可观察产出：** 一个默认活动工作目录端到端流程可完成读取、编辑保存、创建、右键操作、打开、同源剪切粘贴、跨来源复制/剪切拒绝和删除；旧 scope/stale event 不污染新树；Web/remote 能力矩阵可重复验证。
- **来源：** `US-001`—`US-006`、`AC-001`—`AC-011`、`AC-013`、`ADR-001`—`ADR-003`、`NFR-001`—`NFR-004`。
- **当前事实：** 现有 route/service/component suites 各自覆盖局部契约；诊断红灯集中在默认 owner composition，UI tests 缺少 context/open/duplicate-submit/stale-scope 的完整闭环。
- **Planning Depth 原因：** 跨层共享核心与 UI E2E Gate；必须区分新失败、基线失败和环境失败，并给出恢复/回滚证据。

## 2. 决策状态

### 已锁定决策

- 以现有测试夹具、Knowledge client、ResourceIO route、operation journal、native grant 和 Playwright 配置为唯一验证入口。
- 只新增薄的 integration/E2E 场景，不重写既有单元测试或复制生产逻辑。
- E2E 的执行 owner 是当前实现/集成 owner；若后续 Goal Plan 委派，Lead 在集成阶段运行 UI Gate。
- 失败必须分类并记录，不能以跳过或放宽断言制造绿色。

### 已采用的低影响假设

- `tests/knowledge-workspace-e2e/playwright.config.ts` 已能提供 Web/desktop project；原生默认应用动作在 Web/remote project 仅验证隐藏/拒绝，不要求实际打开外部应用。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| cross-layer integration fixture、Knowledge tree integration、Playwright user flow、capability/stale event regression | T-01~T-04 的实现和定向 suites、现有 E2E harness、Desk preview/native bridge | 新生产能力、上游 merge、发布部署、性能基准扩展、修改既有公共 DTO |

## 4. 要构建什么

测试启动活动工作目录并加载 Knowledge。用户打开 Markdown 编辑并以 expected version 保存，创建 page/folder 后观察 dialog 关闭、树定位和 page focus；对 PDF/JPG/HTML 选择既有 preview/open policy；右键执行同源 cut/paste 与跨来源 copy/cut；删除使用 Trash operation。测试期间切换 workspace 并注入 stale event，确认旧 scope 只触发 resync。Web/remote/no-grant 项目检查原生动作隐藏且相对路径/preview 仍可用。所有场景均保存公共接口结果、磁盘事实和 UI 观察结果。

## 5. 实现契约

- **入口或接缝：** route composition integration、KnowledgeResourceTree integration seam、Playwright E2E。
- **输入与输出：** temporary work roots/source fixtures + UI actions → API results, filesystem assertions, tree/editor/menu observations and categorized test result。
- **公共接口变化：** 无；只增加 tests/fixtures。
- **不变量：** 每个 mutation 只一次；source-relative scope；事件 sequence 单调/旧事件 resync；无 native capability 时不出现绝对路径动作；不改链接文本。
- **状态或数据流：** setup root → open main/sources → read/write/create/open → clipboard/trash operations → event/tree/editor settle → switch scope/stale injection → capability assertions → cleanup。
- **错误与失败行为：** 预期 conflict/unavailable/cross-source cut rejection 必须明确断言；任何意外 503、部分写入、重复请求或路径泄露标记为 Ticket failure。
- **兼容要求：** 既有 Desk/Knowledge/ResourceIO suites 全部保持绿色；E2E 不依赖外部默认应用副作用。
- **安全与隐私要求：** 测试只使用临时根和 opaque address；日志不得记录真实用户绝对路径或敏感内容。

## 6. 执行路线

1. 建立跨层 fixture 和最小 UI scenario，先验证 T-01 owner composition 与磁盘事实。
2. 加入 dialog/context/open/clipboard/trash 端到端路径，确保成功 continuation 和事件 settle 只投影一次。
3. 加入 workspace switch/stale event、Web/remote/native capability matrix 和安全断言。
4. 运行定向 unit/integration/E2E 及 typecheck；按新失败、基线失败、环境失败分类。
5. 形成最终 Gate Evidence，若发现契约偏差按 deviation-control 停止，不在 Gate 内自行扩范围。

## 7. 路径访问契约

- **预计修改点：** 新增 integration/E2E 测试文件和必要的测试 fixture。
- **可写范围：** 仅 frontmatter `writable_paths`；生产 core/server/desktop implementation 只读。
- **只读上下文：** T-01~T-04 生产路径、现有 suites、upstream ledger。
- **共享路径：** 无；使用新文件避免与前置 Ticket 的测试文件所有权冲突。
- **保留或不动：** 不修改 Playwright 全局配置或 package scripts，除非 deviation 获批。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 核心 API/磁盘事实 | 新 integration suite | `npm test -- --run tests/knowledge-workspace-resource-convergence.test.ts` | save/create/delete/copy/move 与事件结果、磁盘内容一致 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |
| UI 生命周期/菜单/open | Knowledge tree integration | `npm test -- --run desktop/src/react/__tests__/components/KnowledgeResourceTree.integration.test.tsx` | dialog/menu/open/locate/focus 一次且 capability 正确 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |
| 用户流程 | Playwright E2E | `npm run test:knowledge:e2e -- tests/knowledge-workspace-e2e/specs/resource-convergence.spec.ts` | Web/desktop 关键流程完成；remote/native 动作按能力隐藏/拒绝 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |
| 回归 | focused suites + typecheck | `npm test -- --run tests/knowledge-workspace-route.test.ts tests/resource-io-route.test.ts tests/knowledge-workspace-lifecycle.test.ts tests/knowledge-copy-service.test.ts`；`npm run typecheck` | 既有相关行为无回退 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |
| 失败分类 | Evidence review | 记录每个非零退出码及环境/基线/新失败分类 | 无未解释失败或跳过关键 Gate | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-05.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 依赖 T-01~T-04 后运行；先 integration 再 E2E，最后全套回归。
- **兼容窗口：** 无协议迁移；测试只验证现有兼容窗口。
- **监控信号：** operation id/request hash、scope/event sequence、request count、menu capability snapshot、E2E trace。
- **回滚或前向恢复：** 测试 fixture 自动清理；产品失败回到对应前置 Ticket 修复，不在 Gate 中修改生产代码。
- **不可逆操作与批准点：** E2E 只使用临时根和 Trash；无真实用户文件/默认应用副作用。
- **收缩条件：** 所有 AC-001~011/013 在公共接缝有证据，且无并行第二实现。

## 10. 验收标准

- [x] `AC-001`—`AC-011`、`AC-013`：跨层 integration/E2E 全部通过并映射 Evidence。
- [x] 失败按新/基线/环境/无效验证分类，关键 Gate 不跳过。
- [x] UI E2E 由当前实现或集成 owner 执行；委派时由 Goal Plan 明确转交 Lead。
- [x] 实际项目修改未超出 `writable_paths`，无未批准偏差。
