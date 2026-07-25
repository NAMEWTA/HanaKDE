# OpenHanako AI 实施边界

本文件只补充仓库 `AGENTS.md`。开始任何 ticket 前必须先读取 `ADR.md`、`CONTEXT.md`、`LOG.md`；产品验收见 `spec.md`，实现规则见 `rules.md`。任何下游文件都不得改变三份基础文档的意图。

本 change 包位于 `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/`（仅 Markdown）。包内链接用相对路径；代码路径均相对**仓库根**。

1. `ADR.md`、`CONTEXT.md`、`LOG.md` 是设计事实基础；当前 HanaKDE 工作树是唯一代码事实来源。开始 ticket 时同时重新读取基础条目与 ticket 列出的真实文件。
2. 保留现有 ResourceIO、Desk、Mobile Workbench、CM6、Open/Full 和测试接缝，不创建平行运行时。
3. Knowledge 核心必须在独立 Open Server 中成立，不依赖 Electron 内存。
4. 不重定义 ResourceRef；远程协议不暴露绝对路径。
5. 每次文件写入、移动、删除或恢复都通过 ResourceIO/provider 或公开 coordinator。
6. 不修改生成 bundle；不访问 Engine 私有状态；不以动态 import 绕过 boundary。
7. SilverBullet 仅按 [`silverbullet-reference-matrix.md`](./silverbullet-reference-matrix.md) 审计式采用，保留 MIT notice（见 `silverbullet/LICENSE.md`），不引入其运行时。
8. 不把未保存 buffer、索引或 UI state 当作持久知识事实。
9. 不在最终集成 ticket 首次实现产品能力、原生 adapter、i18n、a11y 或安全处理。
10. 只报告实际执行的测试、构建和平台验证。
11. 开始实现前按 [`README.md`](./README.md) 的文档核对清单与 [`implementation-baseline.md`](./implementation-baseline.md) 重新确认分支、接缝与 Node/package 约束；失败时先同步文档基线，不根据旧路径猜测。
12. 索引、operation、native 和 E2E 必须遵守对应实施契约，不得在 ticket 中重新选择技术方案。
13. 每条用户故事只由 [`requirements-traceability.md`](./requirements-traceability.md)（及对应 ticket「需求追踪」行）指定的 primary owner 实现和验收；supporting ticket 不得假定 Ticket 57 补齐。
14. 执行证据写入 ticket 与 `release-evidence.md`，不要把测试/构建流水写入设计 `LOG.md`。
