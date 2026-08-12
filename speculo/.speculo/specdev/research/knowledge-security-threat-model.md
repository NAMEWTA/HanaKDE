# Knowledge Security Threat Model

- Promoted: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/threat-model.md</Path>`
- Status: Current security baseline

## 核心信任边界

- ProviderRootIdentity、PathGuard 和 commit scope recheck 防止 symlink、junction、mount replacement 与根外访问。
- 远程 DTO 不暴露绝对路径、UNC、盘符、root identity 或 scope token；错误和日志只含稳定错误码及脱敏地址。
- owner/user/studio 只来自认证 Hono context；请求 body 中身份字段必须被 schema 拒绝。
- HTML、SVG、Mermaid 和 URI 使用严格 allowlist、sanitizer、stale-result guard，并丢弃交互绑定。
- 所有大内容在 read 前 stat 并经过 Content Gate；导入限制深度、条目数和总字节，且不跟随 symlink。
- Operation Journal 与 recovery barrier 防止复合操作在崩溃后留下无解释状态。
- Native bridge 需要 loopback、本地 principal、Main-only credential 和单次 action/window grant。

## 必测风险

真实临时文件系统必须覆盖 symlink/junction、TOCTOU、大小写与 Unicode 别名、日志控制字符、主动内容、10 MiB 边界、`.trash` 替换、索引/WAL/manifest 损坏、watcher gap、operation crash recovery、grant replay、恶意导入、系统废纸篓失败和跨 provider 大文件传输。

Windows 需要额外验证 junction、UNC、case-insensitive 和 system trash；macOS/Linux 验证各自文件系统行为。任何 fail-open、路径或正文泄露、永久删除 fallback、journal 丢失都是发布阻断。

完整 TM-001 至 TM-020 的 owner、测试与残余风险矩阵保留在来源归档中。
