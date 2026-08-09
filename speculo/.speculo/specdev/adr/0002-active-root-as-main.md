# ADR-0002: 活动工作根映射为逻辑 main

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0284`)

## 决策上下文

Knowledge 需要一个稳定主来源，同时不能复制 Desk 的 workspace 状态或制造第二套目录配置。

## 决策

当前 session 的 cwd 或 `workspaceMountId` 是 Knowledge workspace 的逻辑 `main`。更换活动根等同关闭旧 workspace 并打开新 workspace，旧 Knowledge tabs、树状态和附加来源不继承。

## 后果

主来源身份清晰且不产生双重配置；切换根会有意重置 Knowledge 会话状态。
