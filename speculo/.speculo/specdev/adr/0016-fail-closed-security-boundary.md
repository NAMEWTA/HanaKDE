# ADR-0016: Knowledge 安全边界默认拒绝

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0298`)

## 决策上下文

文件来源、远程 DTO、主动内容、路径别名和 TOCTOU 都跨越信任边界。

## 决策

provider 证明真实根与 scope，Server 校验所有 DTO，principal/owner/scope 只来自认证 context。未知根关系、能力或 identity 一律拒绝；HTML/SVG/URI、控制字符、UNC、Unicode 别名和资源耗尽由恶意 workspace 测试覆盖。诊断只输出稳定错误码和脱敏标识。

## 后果

不确定 provider 或平台能力会显式不可用，换取路径、身份和内容边界的可验证性。
