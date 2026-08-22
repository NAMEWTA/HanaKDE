# ADR-0025: 运行时依赖使用精确入口完整性门禁

- Status: Accepted
- Date: 2026-08-22
- Source: `<Path>{roots.state}/specdev/archive/2026-08/2026-08-12-openhanako-v0-446-6-platform-gates/ADR.md</Path>` (`ADR-003`)

## 决策上下文

npm 增量安装可能留下版本元数据正确、但包内运行时文件残缺的目录。版本检查或 `npm ls` 无法证明 Server、CLI 和 Desktop 启动链实际可解析。

## 决策

production dependency 完整性按 manifest 中精确、非通配的 runtime exports 验证。packaged build wrapper 保持 `root-only` 范围，避免对 prune 后未使用 subpath 误报；根开发安装使用 `all-exact`，并对关键 Pi AI 链执行真实 ESM import smoke。门禁在 postinstall 和开发入口的构建、helper 或应用启动前执行。

完整性失败以 `HANA_DEPENDENCY_INTEGRITY` fail-fast，指出 package/entrypoint 并提示 `volta run npm ci`。产品进程不得自动改写开发环境的 `node_modules`。

## 后果

损坏安装会更早暴露，启动增加一次只读检查；Node、依赖版本和 lockfile 不因恢复而隐式改变。新增 production dependency 或 exports 变化必须通过相应 fixture、import 和 launcher contract。
