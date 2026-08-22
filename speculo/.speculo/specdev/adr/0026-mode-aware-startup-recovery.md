# ADR-0026: 启动恢复按开发态与打包态分流

- Status: Accepted
- Date: 2026-08-22
- Source: `<Path>{roots.state}/specdev/archive/2026-08/2026-08-12-openhanako-v0-446-6-platform-gates/ADR.md</Path>` (`ADR-004`)

## 决策上下文

源码开发的依赖损坏与安装包中的 artifact 组件损坏具有不同 authority 和恢复材料。统一把 `ERR_MODULE_NOT_FOUND` 解释为自动更新竞态会给出错误建议，也可能形成无效重试。

## 决策

开发态模块完整性失败零重试，立即停止并提示开发者执行干净安装。打包态允许一次短退避；持续失败时只显示“修复并重启/退出”，且仅在用户确认后调用既有 artifact repair。

组件修复只清理 `HANA_HOME/artifacts/` 下的白名单组件状态，并通过安装包签名 seed 的正常 artifact boot 恢复。取消、修复失败或仍缺模块时不得 relaunch 循环。

## 后果

Desktop 必须保留稳定的运行模式分类、脱敏错误、本地化文案和确认/取消/失败测试。agents、sessions、settings 及 artifact 根下非白名单状态始终不属于组件修复范围。
