# ADR-0028: 插件表面能力由 Host 授权并按执行上下文交付产物

- Status: Accepted
- Date: 2026-08-26
- Source: `<Path>{roots.state}/specdev/archive/2026-08/2026-08-13-markdown-wechat-plugin/ADR.md</Path>` (`ADR-006`), `<Path>{roots.state}/specdev/archive/2026-08/2026-08-25-add-plugin-page-navigation-capability/evidence/direct-spec.md</Path>`, `<Path>{roots.state}/specdev/archive/2026-08/2026-08-25-enable-plugin-surface-downloads/evidence/direct-spec.md</Path>`

## 决策上下文

Page 与 Widget 运行在受限 iframe 中，既没有 Agent Session 的文件上下文，也不能自行取得宿主路由身份。下载、打开工作台等常见交互因此需要 Host 参与，同时必须保持 manifest 授权和插件身份隔离。

## 决策

iframe sandbox 与 surface capability dispatch 由 Host 统一拥有。能力必须由 manifest 显式声明，调用者身份由 Host 已绑定的插件实例确定，不接受 payload 自报身份。

插件导航只允许打开调用插件自己的 Page，不暴露任意路由、其他插件目标或身份覆盖。Page/Widget 中由用户手势触发的导出使用浏览器下载；具有 Agent Session 上下文的 tool 输出继续使用 `SessionFile`。Host 只开放完成该交付所需的下载 sandbox 权限，不把通用文件系统写入能力授予 iframe。

## 后果

新增 surface capability 必须同时更新协议、SDK、manifest 校验、Host dispatch 与真实表面测试。插件可提供一致的工作台跳转和导出体验，但不能借此越过自身 Page、Session 或文件 authority 边界。
