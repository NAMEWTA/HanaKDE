# ADR-0001: OpenHanako 原生架构是知识工作区唯一底座

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0283`)

## 决策上下文

知识工作区需要吸收成熟 Markdown 编辑器经验，但仓库已经具有 Electron、React、Node、ResourceIO、IPC、构建和测试边界。整体移植 SilverBullet 会形成平行应用和第二套运行架构。

## 决策

知识工作区直接扩展 HanaKDE/OpenHanako 现有模块与公共契约。优先复用现有组件和依赖，只在职责确实缺失时增加最小模块。`silverbullet/` 仅作为能力单元级参考，不能成为运行时依赖或兼容目标。

## 后果

实现保持单一工程与安全边界，但参考能力需要逐项适配，仓库或参考快照变化时必须重新审计。
