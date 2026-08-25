# Feature Placement Verdict

## Verdict

本变更属于 HanaKDE 系统本体与发行基础设施，不适合作为内置插件。

## Reasons

- Electron 运行时预检发生在桌面主进程启动之前，插件生命周期尚未建立。
- `productName`、安装器、更新清单、构建产物命名和 GitHub Release 是全局发行契约。
- Apple 公证、ad-hoc 签名和完整性签名属于构建与安全边界，插件不能安全拥有这些职责。
- 品牌迁移覆盖 core/server/desktop/shared/lib/hub/cli 的用户可见面，同时必须维护跨层兼容标识。

## Placement

- 根包脚本与构建配置：`package.json`、`scripts/`、`build/`
- 桌面产品面：`desktop/`
- 运行时产品面：`core/`、`server/`、`shared/`、`lib/`、`hub/`、`cli/`
- 发布与验收：`.github/workflows/`、`tests/`、发布摘要
