# 平台 Gate 与启动完整性

**平台 Gate 产品缺陷**：真实阻断平台验证中发现、会使当前候选不能完成平台验收的产品代码缺陷。它留在当前 change，但由独立产品修复 Ticket 拥有，平台 Ticket 只在修复后的固定点重跑 Evidence。
_Avoid_: 把产品修复塞进平台 harness Ticket；另开无关联 follow-up

**运行时依赖完整性**：已安装生产依赖声明的精确运行时入口在磁盘上可读，并且关键启动导入链可以由当前 Node 运行时解析。包版本存在或 `npm ls` 通过不等于完整性成立。
_Avoid_: 依赖版本正确；node_modules 存在

**开发态依赖损坏**：源码运行模式下根 `node_modules` 的包内容残缺或不可解析，与 artifact 自动更新无关。稳定恢复方式是停止启动并由开发者执行干净的 `volta run npm ci`。
_Avoid_: 自动更新落地竞态

**打包组件损坏**：安装包运行模式下，激活的签名 server/renderer artifact 缺少运行时文件或模块入口。它可以短暂退避一次；持续失败后只能经用户确认执行组件修复。
_Avoid_: 开发依赖损坏

**组件修复**：只重置 `HANA_HOME/artifacts/` 下白名单组件状态，并通过正常 artifact boot 从安装包签名 seed 恢复。agents、sessions、settings 和其他用户数据不属于组件修复范围。
_Avoid_: 恢复出厂设置；清空用户数据
