---
schema_version: 1
artifact: prototype-record
change: 2026-08-24-knowledge-multi-root-explorer-redesign
prototype_id: PROTO-001
question: Knowledge 的 main 与额外挂载目录应如何按现有工作台视觉在同一个 Explorer 树中表达？
branch: ui
status: answered
workspace_ref: specdev-worktree/prototype-knowledge-multi-root-explorer
project_paths:
  - desktop/src/react/components/knowledge-workspace/KnowledgeLayout.tsx
  - desktop/src/react/components/knowledge-workspace/KnowledgeWorkspace.module.css
assets:
  - <Path>{roots.state}/specdev/changes/2026-08-24-knowledge-multi-root-explorer-redesign/prototypes/PROTO-001/assets/multi-root-explorer-desktop.png</Path>
  - <Path>{roots.state}/specdev/changes/2026-08-24-knowledge-multi-root-explorer-redesign/prototypes/PROTO-001/assets/workbench-dense-desktop.png</Path>
  - <Path>{roots.state}/specdev/changes/2026-08-24-knowledge-multi-root-explorer-redesign/prototypes/PROTO-001/assets/responsive-stack-desktop.png</Path>
  - <Path>{roots.state}/specdev/changes/2026-08-24-knowledge-multi-root-explorer-redesign/prototypes/PROTO-001/assets/multi-root-explorer-narrow.png</Path>
winner: multi-root-explorer + Desk tree-row renderer
promotion_target: <Path>{roots.state}/specdev/changes/2026-08-24-knowledge-multi-root-explorer-redesign/spec.md</Path>
cleanup_status: registered
updated_at: 2026-08-24T11:32:00+08:00
---

# Prototype PROTO-001: Knowledge 多根 Explorer

## Question and Assumption

- **Question:** Knowledge 的 `main` 与额外挂载目录应如何按现有工作台视觉在同一个 Explorer 树中表达？
- **Why a prototype is needed:** 当前独立 Sources 栏与树根重复表达来源，需要在真实 Knowledge shell 中比较收敛后的信息层级和窄屏行为。
- **Branch selection evidence:** 问题只涉及页面外观、信息层级和交互布局，选择 UI 分支。
- **Assumption when user was unavailable:** 用户已在规划确认中授权三个变体，并以 VS Code 多根同树方向为目标。

## Run and Assets

- **Command or URL:** `npm run dev:web`，打开 `http://127.0.0.1:5173/index.html?variant=multi-root-explorer`。
- **Branch / commit:** `speculo/2026-08-24-knowledge-multi-root-explorer-redesign/prototype-PROTO-001` / uncommitted
- **Workspace locator:** `specdev-worktree/prototype-knowledge-multi-root-explorer`
- **Project-relative assets:** <Path>{roots.state}/specdev/changes/2026-08-24-knowledge-multi-root-explorer-redesign/prototypes/PROTO-001/assets/</Path>

## Evaluation

- **Scenarios or variants reviewed:** `multi-root-explorer`、`workbench-dense`、`responsive-stack`。
- **Observed feedback:** 左侧多根 Explorer 与用户提供的 VS Code workspace 参考一致；真实主根名和挂载根名可直接扫描。右侧 `workbench-dense` 改变了用户指定方向；`responsive-stack` 在宽屏消耗过多垂直编辑空间。600x720 下左侧方案按单列顺序呈现，无横向溢出或控件重叠。
- **Answer:** 采用左侧单 Explorer。删除独立 Sources 栏，`main` 与 mounted sources 作为一级兄弟根；根和资源行统一使用 Desk 的 28px 行高、16px 缩进、14px disclosure/file icon 结构。
- **Winner and rejected options:** 赢家为 `multi-root-explorer + Desk tree-row renderer`；拒绝右侧 Explorer 与宽屏横向树堆叠，仅保留窄屏单列响应式投影。

## Promotion and Cleanup

- **Promotion target:** <Path>{roots.state}/specdev/changes/2026-08-24-knowledge-multi-root-explorer-redesign/spec.md</Path>
- **Main cleanup:** clean
- **Temporary branch retained:** yes，等待独立 cleanup 授权
- **Wayfinder solution comment:** not-applicable
