# ADR-0019: Provider 必须证明根身份与不重叠关系

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0301`)

## 决策上下文

用户输入路径或 provider ID 无法可靠识别 symlink、junction、大小写别名、mount replacement 和虚拟根关系。

## 决策

根身份及 scope proof 属于 provider 契约；provider 返回 `same|ancestor|descendant|disjoint|unknown` 关系，只有 `disjoint` 可同时活动，无法证明时拒绝挂载。

## 后果

旧 provider 可能需要 identity resolver 才能作为附加来源，但隔离不依赖字符串猜测。
