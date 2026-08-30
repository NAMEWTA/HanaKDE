# 实验发行完整性规范术语

- Promoted: 2026-08-30
- Source: `<Path>{roots.state}/specdev/archive/2026-08/2026-08-27-macos-release-team-id-crash/spec.md</Path>`、`<Path>{roots.state}/specdev/archive/2026-08/2026-08-27-macos-release-team-id-crash/evidence/T-01.md</Path>`、`<Path>{roots.state}/specdev/archive/2026-08/2026-08-27-macos-release-team-id-crash/evidence/T-02.md</Path>`

**平台发行身份**：由操作系统发行生态识别的外部身份，例如 macOS Developer ID、notarization 或 Windows Authenticode。HanaKDE 实验发行当前不要求该身份，必须明确提示系统安全警告和信任边界。
_Avoid_: 内部 artifact 签名；把 ad-hoc Mach-O sealing 表述为 Developer ID 信任

**内部 artifact 加密身份**：HanaKDE 用于 seed、Server/Renderer artifact、manifest 和更新边界的项目内签名与 pinned keyset 验证。它与平台发行身份相互独立，实验发行不得为了实现无证书打包而删除或放宽内部校验。
_Avoid_: 平台代码签名；把 `.sig` 删除当作无证书发行方案

**原包门（Untouched-package gate）**：对构建产生且未二次重签或改写的安装包执行身份、内容哈希、安装、启动、健康检查和清理的目标平台门禁。macOS arm64/x64 与 Windows 的 required Gate 必须在上传前完成。
_Avoid_: 构建成功；静态 `codesign --verify`；对测试重签副本做启动 smoke
