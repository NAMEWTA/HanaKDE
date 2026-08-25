---
schema_version: 1
artifact: source
change: 2026-08-25-hanakde-v0-0-3-brand-release
source_type: conversation
canonical_locator: null
captured_at: 2026-08-25T10:30:34+08:00
content_sha256: be97274dfc2bcc5816cdf84bde168df58e07bed58c4b50f53b6781be98b1eace
remote_state: not-applicable
close_capability: not-applicable
---

# Source: HanaKDE v0.0.3 品牌与发行修复

## Capture Metadata

- **Capture method:** conversation
- **Author:** user
- **Created / updated:** 2026-08-25
- **Labels or classification supplied by source:** brand、Electron、release、v0.0.3、signing boundary
- **Attachments:** none
- **Redactions:** none

## Original Content

用户要求修复 Electron 安装后缺少 `path.txt` 导致的开发环境启动失败，将当前产品名改为 HanaKDE，删除依赖原 HanaAgent 身份的签名与公证配置，并重新发布 v0.0.3。用户在审阅计划后明确回复“确认执行”。

## Source Comments

- 允许实现、提交、集成、创建 `v0.0.3` 标签、推送并监控 GitHub Release。
- 不纳入当前工作区内 Todo 插件、财务工作台和其他进行中的 SpecDev 改动。
- v0.0.3 保留 `com.hanako.app`、`.hanako*` 数据目录、`HANA_HOME`、`hana` CLI 与 `@hana/*` 包名，避免补丁版本破坏更新与数据兼容。
- 删除 Apple Developer ID 公证链；保留不依赖上游证书的本地 ad-hoc Mach-O 签名和 Ed25519 完整性签名。
