# ADR-0018: 横切质量由垂直切片交付

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0300`)

## 决策上下文

把本地化、可访问性、安全、性能和失败行为留到发布收尾会形成无法验证的质量积压。

## 决策

每个 UI ticket 同时交付五语言、键盘、ARIA、主题和窄布局；每个资源操作 ticket 同时交付路径、安全、版本冲突和失败注入。发布 ticket 只汇总证据，不首次实现核心行为或原生 adapter。

## 后果

每个垂直切片的完成成本更高，但发布阶段不再承担集中补洞。
