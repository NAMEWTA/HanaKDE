# Archive And Consolidate Dry-Run

> 生成时间：2026-08-22 00:47 +08:00
> Workflow：specdev
> 模式：archive-single / executed
> Change：2026-08-12-openhanako-v0-446-6-platform-gates

## 路径上下文

| 名称 | 路径 |
|---|---|
| project_root | `<Path>.</Path>` |
| workflow_root | `<Path>{roots.workflows}/specdev</Path>` |
| state_root | `<Path>{roots.state}/specdev</Path>` |
| changes_root | `<Path>{roots.state}/specdev/changes</Path>` |
| archive_root | `<Path>{roots.state}/specdev/archive</Path>` |
| commands_root | `<Path>{roots.commands}</Path>` |
| permanent ADR store | `<Path>{roots.state}/specdev/adr</Path>` |
| permanent context store | `<Path>{roots.state}/specdev/context</Path>` |

## 阶段一：归档计划

### 预检摘要

| 检查项 | 状态 |
|---|---|
| workspace/config/migration | pass；已初始化，无 pending migration |
| changes_root / archive_root | pass；真实路径位于 state root 内 |
| change 名称 | pass；符合日期 kebab 规则 |
| change status | pass；`change_status: completed`，`completed_at: 2026-08-22T00:47:25+08:00` |
| Ticket / Gate | pass；T-27/T-28/T-29/T-22/T-25 done，T-23 cancelled |
| approved deviation | pass；D-T25-02 明确记录缺失 macOS 环境测试不计为 pass |
| external reconcile | pass；`external_action: not-applicable` |
| 全局索引 | pass；change 在 `active` 中唯一，未出现在 `archived` |
| 源路径 | pass；存在 |
| 目标路径 | pass；不存在 |
| SpecDev complete validator | pass；0 errors，0 warnings |

### 移动与状态更新

| # | 来源 | 目标 | 动作 | 风险 | 状态 |
|---|---|---|---|---|---|
| 1 | `<Path>{roots.state}/specdev/changes/2026-08-12-openhanako-v0-446-6-platform-gates</Path>` | `<Path>{roots.state}/specdev/archive/2026-08/2026-08-12-openhanako-v0-446-6-platform-gates</Path>` | 原子移动整个 change 目录 | high：源路径消失并转为只读归档 | ready |
| 2 | `<Path>{roots.state}/specdev/status.json</Path>` | 同文件 | 从 `active` 移除 change，去重追加到 `archived` | medium：全局索引更新 | ready |
| 3 | 归档目标内 `.status.json` | 同文件 | 设置 `change_status: archived`、`archived: true`、`archive_path`，完成 archive work | medium：生命周期终态 | ready |

当前仓库存在用户其他未提交改动；confirmed 执行只移动本 change 并精确更新全局索引，不清理、提交或覆盖其他路径。

## 阶段一：知识合并计划

### 提取摘要

| 目标 Store | 新建 | 合并 | 冲突 | 跳过 |
|---|---:|---:|---:|---:|
| `adr/` | 2 | 0 | 0 | 2 |
| `context/` | 1 | 0 | 0 | 1 |

### ADR 候选

| 目标 | 来源 | 内容摘要 | 毕业标准 | 风险 | 状态 |
|---|---|---|---|---|---|
| `<Path>{roots.state}/specdev/adr/0025-runtime-dependency-integrity-gate.md</Path>` | change ADR-003 | production dependency 必须验证精确 runtime exports；开发入口前置 fail-fast，禁止产品进程自动修复 node_modules | stable-mechanism、must-know | low：新增，不覆盖现有 ADR | ready |
| `<Path>{roots.state}/specdev/adr/0026-mode-aware-startup-recovery.md</Path>` | change ADR-004 | 开发态零重试并提示 clean install；打包态一次退避后经用户确认做白名单 artifact repair，失败不循环 | stable-mechanism、must-know | low：新增，不覆盖现有 ADR | ready |

### Context 候选

| 目标 | 来源 | 动作 | 内容 | 毕业标准 | 风险 | 状态 |
|---|---|---|---|---|---|---|
| `<Path>{roots.state}/specdev/context/platform-startup-integrity.md</Path>` | change CONTEXT | create | 运行时依赖完整性、开发态依赖损坏、打包组件损坏、组件修复四个规范术语及 Avoid 边界 | stable-mechanism、must-know | low：新文件，无现有定义冲突 | ready |

### Ephemeral

| 来源 | 知识项 | 跳过理由 |
|---|---|---|
| change ADR-001 | 平台阻断 Gate 独立后续化 | 单次 change 生命周期治理，归档后不再是当前架构 |
| change ADR-002 | 平台 Gate 缺陷留在当前 change | 单次 owner/DAG 决策，脱离该 change 会误导 |
| change CONTEXT | 平台 Gate 产品缺陷 | change 特定流程术语，不是长期产品领域术语 |
| LOG / Evidence | 调试轨迹、固定点、用户 waiver | 历史证据随归档保留，不提升为现役知识 |

## 阶段二：清理候选

已扫描 `<Path>{roots.state}/specdev/adr</Path>` 的 24 个 ADR 和 `<Path>{roots.state}/specdev/context/openhanako-knowledge-workspace.md</Path>`。现有 ADR 均创建不足 30 天，永久 context 仍被归档与 active change 引用。

| 分类 | 数量 | 结论 |
|---|---:|---|
| delete | 0 | 无 |
| merge | 0 | 无重复权威内容 |
| rewrite | 0 | 无必须改写项 |
| needs-confirmation | 0 | 无术语或 ADR 冲突 |
| keep | 25 | 24 个现有 ADR + 1 个现有 context 文件保持不动 |

本计划不删除、合并或改写任何现有永久知识。

## 执行后验证

confirmed 执行完成后必须验证：

1. source change 不存在，archive target 完整存在。
2. 全局 `active` 与 `archived` 无重叠。
3. 归档 `.status.json` 为 archived 且路径一致。
4. ADR-0025、ADR-0026 与 context 文件存在，内容带来源追踪。
5. 运行归档目标的 `--stage complete` 校验与 SpecDev `--self-check`。
6. 重读永久知识，确认没有计划外修改。

## 摘要

- 待归档 change：1
- 待创建永久 ADR：2
- 待创建 context 文件：1
- 待清理项：0
- 冲突/需额外裁决项：0
- 破坏性动作：1 次 change 原子移动 + 2 处状态更新

**Dry-run 阶段未执行归档移动、永久知识写入或清理；用户随后已明确确认本计划。**

## 执行后验证补遗

> 执行时间：2026-08-22 08:51 +08:00
> 结果：verified

### 已执行动作

| 项目 | 结果 |
|---|---|
| change 原子移动 | moved：源目录不存在，归档目标完整存在 |
| 全局索引 | updated：从 `active` 移除并向 `archived` 去重追加 |
| 归档状态 | updated：`change_status: archived`、`archived: true`、`current_work: null`、archive work 已写入 `works_run` |
| ADR-0025 | created：`<Path>{roots.state}/specdev/adr/0025-runtime-dependency-integrity-gate.md</Path>` |
| ADR-0026 | created：`<Path>{roots.state}/specdev/adr/0026-mode-aware-startup-recovery.md</Path>` |
| platform startup context | created：`<Path>{roots.state}/specdev/context/platform-startup-integrity.md</Path>` |
| 清理 | no-op：计划中无 delete/merge/rewrite 项 |

### 重读验证

- source absent：pass。
- archive target present and complete：pass。
- active/archived 无重叠，目标名称在 `archived` 中恰好一次：pass。
- 归档 `.status.json` 生命周期、路径与 Work 状态：pass。
- 三个永久知识文件存在、非空且包含归档来源追踪：pass。
- 新文件尾随空白与仓库 `git diff --check`：pass。
- 归档目标 `--stage implement`：0 errors，1 个预期 archived-location warning。
- 归档前 `--stage complete`：0 errors，0 warnings。

### 校验器限制与既有错误

- 归档后再次运行 `--stage complete` 得到 `complete stage requires change_status=completed`。这是当前校验器与归档终态 `change_status: archived` 的互斥；没有将归档状态回退为 completed。归档后使用 implement/schema 校验确认工件有效。
- SpecDev `--self-check` 报告 4 个既有路径引用错误，位于用户原有的 `common/skills/subagent-delivery/` 改动：三个 `DISPATCH.md` / `RETURN.md` 裸路径和一个 `skills` 目录裸引用。本计划没有修改这些文件。

### 最终输出

```text
mode=executed
scope=archive-single
archive_plan=moved
consolidation_plan=3-created
cleanup_candidates=0-actions
conflicts_needing_confirmation=0
verification.verdict=verified
```
