# 平台启动完整性规范术语

- Promoted: 2026-08-22
- Source: `<Path>{roots.state}/specdev/archive/2026-08/2026-08-12-openhanako-v0-446-6-platform-gates/CONTEXT.md</Path>`

**运行时依赖完整性**：已安装 production dependency 声明的精确运行时入口在磁盘上可读，并且关键启动导入链可由当前 Node 运行时解析。
_Avoid_: 依赖版本正确；`node_modules` 存在

**开发态依赖损坏**：源码运行模式下根 `node_modules` 的包内容残缺或不可解析，与 artifact 自动更新无关。恢复方式是停止启动，由开发者执行干净的 `volta run npm ci`。
_Avoid_: 自动更新落地竞态；产品进程自动修复开发依赖

**打包组件损坏**：安装包运行模式下，激活的签名 Server/Renderer artifact 缺少运行时文件或模块入口。它可以短暂退避一次，持续失败后只能经用户确认执行组件修复。
_Avoid_: 开发态依赖损坏；无限启动重试

**组件修复**：只重置 `HANA_HOME/artifacts/` 下白名单组件状态，并通过正常 artifact boot 从安装包签名 seed 恢复。agents、sessions、settings 和其他用户数据不属于组件修复范围。
_Avoid_: 恢复出厂设置；清空用户数据
