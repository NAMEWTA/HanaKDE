# 10 测试与源码阅读地图

## 目的与限制

本篇不是测试执行报告，而是静态阅读索引：告诉读者用哪个测试文件验证哪个心智模型。当前 E Work 禁止运行项目命令，因此所有“待验证”都必须保持诚实。

## 职责与非职责

本篇负责把行为问题映射到测试和源码入口；不报告测试通过率，不替用户运行测试，也不把测试文件存在误写成运行时证据。

## Why 按行为合同读测试

按文件目录读测试容易只看到局部实现；按“入口 → owner → 成功 → 失败/恢复”阅读，才能验证状态、错误、并发和清理不变量。

## 按行为域阅读测试

| 行为问题 | 首读测试 | 对应源码入口 |
|---|---|---|
| Server 是否按 ownership 和端口契约启动 | `<Path>tests/server-port-ownership.test.ts</Path>`、`<Path>tests/server-readiness.test.ts</Path>` | `<Path>server/index.ts</Path>`、`<Path>server/bootstrap.ts</Path>` |
| open/full composition 是否保持边界 | `<Path>tests/server-composition-boundary.test.ts</Path>` | `<Path>server/composition/contract.ts</Path>`、`<Path>server/composition/open-root.ts</Path>` |
| Engine 初始化/释放和 session 并发 | `<Path>tests/engine-lifecycle.test.ts</Path>`、`<Path>tests/session-concurrency.test.ts</Path>` | `<Path>core/engine.ts</Path>`、`<Path>core/session-coordinator.ts</Path>` |
| Session abort、manifest 和分支是否恢复 | `<Path>tests/session-coordinator-isolated-abort.test.ts</Path>`、`<Path>tests/session-manifest*.test.ts</Path>` | `<Path>core/session-manifest/</Path>`、`<Path>core/session-coordinator.ts</Path>` |
| Hub cron/heartbeat 与 Activity recovery | `<Path>tests/scheduler-studio-cron.test.ts</Path>`、`<Path>tests/scheduler-heartbeat-default.test.ts</Path>`、`<Path>tests/desk-activity-store.test.ts</Path>` | `<Path>hub/scheduler.ts</Path>`、`<Path>lib/desk/</Path>` |
| Channel/DM 路由和 bridge identity | `<Path>tests/channel-*.test.ts</Path>`、`<Path>tests/bridge-session-key.test.ts</Path>` | `<Path>hub/channel-router.ts</Path>`、`<Path>lib/bridge/session-key.ts</Path>` |
| ResourceIO 是否拒绝越权和 stale write | `<Path>tests/resource-io-authority-boundary.test.ts</Path>`、`<Path>tests/resource-io-local-fs-provider.test.ts</Path>`、`<Path>tests/resource-io-native-secure-write.test.ts</Path>` | `<Path>lib/resource-io/</Path>`、`<Path>lib/sandbox/path-guard.ts</Path>` |
| Knowledge index/query/recovery 是否保持 generation | `<Path>tests/knowledge-index-store.test.ts</Path>`、`<Path>tests/knowledge-index-rebuild.test.ts</Path>`、`<Path>tests/knowledge-operation-recovery.test.ts</Path>` | `<Path>lib/knowledge-workspace/</Path>`、`<Path>core/knowledge-workspace/</Path>` |
| Memory conveyor 和 Dream revision | `<Path>tests/memory-daily-conveyor.test.ts</Path>`、`<Path>tests/memory-dream-revision.test.ts</Path>`、`<Path>tests/memory-ticker-orchestration.test.ts</Path>` | `<Path>lib/memory/</Path>` |
| Provider/Pi SDK 的稳定接缝 | `<Path>tests/provider-registry-crud.test.ts</Path>`、`<Path>tests/pi-sdk-create-session-adapter.test.ts</Path>`、`<Path>tests/model-execution-config.test.ts</Path>` | `<Path>core/provider-registry.ts</Path>`、`<Path>lib/pi-sdk/</Path>` |
| Plugin scan/context/routes/surface | `<Path>tests/plugin-manager.test.ts</Path>`、`<Path>tests/plugin-context.test.ts</Path>`、`<Path>tests/plugin-route-integration.test.ts</Path>`、`<Path>tests/plugin-ui-protocol.test.ts</Path>` | `<Path>core/plugin-manager.ts</Path>`、`<Path>server/routes/plugins.ts</Path>`、`<Path>packages/plugin-protocol/src/index.ts</Path>` |
| Plugin runtime 与发布边界 | `<Path>tests/plugin-runtime.test.ts</Path>`、`<Path>tests/package-build-boundary.test.ts</Path>`、`<Path>tests/build-server-plugin-runtime-deps.test.ts</Path>` | `<Path>packages/plugin-runtime/</Path>`、`<Path>scripts/</Path>` |
| CLI discovery/spawn/chat | `<Path>tests/cli-server-runner.test.ts</Path>`、`<Path>tests/cli-local-server.test.ts</Path>`、`<Path>tests/cli-chat.test.ts</Path>` | `<Path>cli/</Path>` |

## 推荐的源码阅读循环

对每个行为域重复以下顺序：

1. 先读入口或 route，确认调用者和输出形状。
2. 再读拥有状态的 Manager/store，找不变量和生命周期。
3. 再读一个成功测试和一个失败/恢复测试。
4. 回到跨域业务流，确认事件、身份和错误如何传播。
5. 把结论标为事实、推断或待验证，不因测试文件存在就宣称测试已通过。

## 代码规范检查点

- 后端 Pi SDK import 是否都经过 `<Path>lib/pi-sdk/index.ts</Path>`。
- Server route 是否使用公开 Engine 接口，而非私有字段。
- Resource mutation 是否带 expected version、authority 和 audit/event。
- 插件是否通过 manifest capability、ResourceIO 和 request context 获取权限。
- 测试是否覆盖失败、恢复、stale、abort 和 cleanup，而不只是 happy path。

## 当前不能由静态阅读证明的事项

- packaged Electron 在每个目标平台的实际启动成功与 helper 行为；
- Server ready marker、端口 fallback 和 shutdown 在真实进程中的时序；
- Knowledge rebuild、Memory Dream、Cron dispatch 的真实 crash/restart 结果；
- Provider registry 多实例隔离和外部 API/网络差异；
- Bridge 媒体上传、远程连接和插件 UI 在所有客户端上的兼容矩阵。

这些项目应进入后续诊断、原型或验证 Work，而不是在教学文档中假定为已验证事实。

## 下一步阅读路线

读者完成 `00–09` 后，可选择三条深入路线：

- **会话路线：** `02` → `03` → `04` → `05` 的 Session/Resource/Permission 测试。
- **知识路线：** `05` → `06` 的 ResourceIO → Knowledge → Memory → Workspace UI。
- **扩展路线：** `07` → `08` → Plugin Manager/Protocol/Runtime/Build tests。

本篇之后不自动进入实现；若需要修改或补充项目能力，应另建 SpecDev change。

## 下一篇

本 change 暂无下一篇；下一步由用户指定要复述、澄清或继续深入的业务域。若要做运行验证，应移交相应诊断或实现 Work。
