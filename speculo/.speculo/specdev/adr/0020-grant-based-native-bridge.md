# ADR-0020: 原生能力使用最小 grant-based bridge

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0304`)

## 决策上下文

Electron Main 可访问本机路径，但 Knowledge DTO 不得向 Renderer 暴露路径，普通 Renderer token 也不能证明 Main 身份。

## 决策

扩展现有 `window.hana` 最小表面。Desktop-owned Server 每次启动生成 Main-only bridge credential；Server 创建绑定 owner、window、action、address 和 version 的 60 秒单次 grant，由 Main 消费。Picker/clipboard 由 Main 直接向本地 Server 建 plan。

## 后果

保留独立 Server 和路径隐私边界，但增加专用凭据、grant 生命周期及 Main-to-Server 调用。
