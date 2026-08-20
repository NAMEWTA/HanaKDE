---
schema_version: 1
artifact: triage
change: 2026-08-12-knowledge-workspace-resource-convergence
mode: intake
source: <Path>{roots.state}/specdev/changes/{change}/source.md</Path>
classification: bug
risk: critical
route: specdev/diagnose-bugs
ready_for_implementation: false
external_action: not-applicable
updated_at: 2026-08-12T11:52:00+08:00
---

# Triage: Knowledge 工作区资源内核与文件树交互收敛

## 当前判定

- **影响：** Knowledge 编辑、创建、删除和剪切/粘贴主流程不可用；资源树缺少与工作台一致的上下文操作和文件类型打开入口。
- **紧急度：** immediate
- **当前证据：** 路由级 Vitest 已稳定重现 Knowledge ResourceIO/operation 503；现有 UI 测试覆盖创建回调但未覆盖成功后 modal 生命周期与资源树 context menu。
- **相关代码/工件：** `<Path>server/routes/knowledge-workspace.ts</Path>`、`<Path>server/routes/resource-io.ts</Path>`、`<Path>core/knowledge-workspace/workbench-compatibility.ts</Path>`、`<Path>desktop/src/react/components/knowledge-workspace/KnowledgeLayout.tsx</Path>`、`<Path>desktop/src/react/components/knowledge-workspace/KnowledgeResourceTree.tsx</Path>`、`<Path>desktop/src/react/components/desk/DeskTree.tsx</Path>`

## 未知项

- **可发现事实：** Knowledge route 与 Engine `getResourceIO()` 的单一 owner 绑定方式；工作台右键/打开/原生路径 helper 的可复用边界；当前剪切/粘贴 client 与 native clipboard 的失败语义。
- **需要用户决定：** 跨来源剪切是否必须拒绝并要求复制；Web/远程挂载隐藏哪些绝对路径和原生动作；右键菜单是否以图标+tooltip 为主、文字为可访问名称。
- **低影响实现细节：** 菜单定位、图标组件的具体复用方式、刷新节流、错误 toast 文案与局部 CSS。

## 路由

- **下一 Work：** `<Path>{roots.workflows}/specdev/D-diagnose-bugs/D-diagnose-bugs.md</Path>` 完成红灯、最小化与修复契约后，进入 `<Path>{roots.workflows}/specdev/G-grill-with-docs/G-grill-with-docs.md</Path>` 关闭高影响设计，再进入 `<Path>{roots.workflows}/specdev/S-spec/S-spec.md</Path>`。
- **理由：** 当前同时存在可验证运行时 bug 与新增交互范围；必须先确认单一 ResourceIO 根因，再锁定复用/降级/跨来源行为，不能直接实现。

## 外部动作

- **远程目标：** 无
- **关闭能力：** not-applicable
- **当前状态：** not-applicable
- **授权记录：** 仅生成本地 SpecDev 工件和执行只读/测试命令；未提交、推送、部署或远程写入。
