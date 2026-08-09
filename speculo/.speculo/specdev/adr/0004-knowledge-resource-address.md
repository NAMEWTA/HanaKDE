# ADR-0004: 保留 ResourceRef 并新增知识地址

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0286`)

## 决策上下文

既有 provider 依赖 `ResourceRef`，而 Knowledge DTO 需要跨端、无绝对路径的稳定地址。

## 决策

保持 `ResourceRef` 联合类型不变，Knowledge 协议使用 `{ sourceKey, relativePath }`。Server 通过来源注册表解析为 `ResourceRef`；Markdown 只保存当前来源内规范地址，不保存 `sourceKey`。

## 后果

既有 provider 契约保持兼容，Renderer、远程 DTO 和日志不需要暴露本机绝对路径。
