---
schema_version: 1
artifact: triage
change: 2026-08-12-openhanako-v0-446-6-platform-gates
mode: intake
source: <Path>{roots.state}/specdev/changes/{change}/source.md</Path>
classification: bug
risk: critical
route: specdev/implement
ready_for_implementation: true
external_action: not-applicable
updated_at: 2026-08-13T00:03:47+08:00
---

# Triage: Windows Gate 暴露运行时依赖完整性缺陷

## 当前判定

- **影响：** 真实 Windows 开发启动无法导入 Server；当前 T-22 无法继续 package/start smoke，T-25 不能放行。
- **紧急度：** blocking。
- **当前证据：** `<Path>{roots.state}/specdev/changes/{change}/diagnosis.md</Path>` 已确认根包目录残缺、开发启动漏检和 Desktop 误分类；T-23 的既有 Evidence 也会被共享启动代码修改而失去最终 SHA 新鲜度。
- **相关代码/工件：** `<Path>scripts/build-server-deps.mjs</Path>`、`<Path>scripts/patch-pi-sdk.cjs</Path>`、`<Path>scripts/launch.js</Path>`、`<Path>desktop/main.cjs</Path>`、`<Path>desktop/src/shared/server-readiness.cjs</Path>`。

## 未知项

- **可发现事实：** T-27 实现后的测试/构建结果；真实 Windows package/install/start 结果；macOS x64、物理 sleep/wake 与 literal descriptor 结果。
- **需要用户决定：** 无；缺陷归属、修复广度、开发恢复和打包恢复均已在设计树达成共识。
- **低影响实现细节：** verifier 内部函数命名、错误对象局部组织和测试 fixture 布局，遵循现有模块惯例。

## 路由

- **下一 Work：** `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`，从 T-27 开始。
- **理由：** Spec、Ticket、DAG、恢复策略和验证接缝均已决策完备；T-27 完成后 T-22/T-23 才能在同一固定点重跑。

## 外部动作

- **远程目标：** 无。
- **关闭能力：** not-applicable。
- **当前状态：** not-applicable。
- **授权记录：** 仅授权更新本地 change 规划文档；未授权 commit、push、merge、发布或远程写入。
- **尝试与结果：** 无。
