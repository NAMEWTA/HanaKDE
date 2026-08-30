---
schema_version: 1
artifact: diagnosis
change: 2026-08-29-todolist-backend-reliability
status: root-cause-confirmed
feedback_loop_ready: true
red_command: "volta run --node 24.16.0 --npm 11.13.0 npm start"
red_evidence: "Todo /status reported runtime.taskBackend=backend_unavailable because task:register-handler had no host handler during plugin onload."
cleanup_status: clean
updated_at: 2026-08-29T01:24:00+08:00
---

# Diagnosis: Todo 后台启动后不可用

## 1. 现象与影响

桌面端能够加载 Todo 页面，但插件状态接口将任务后台报告为 `backend_unavailable`。Todo 的基础 HTTP 路由仍可直接读写，说明故障不是 Store 丢失，而是提醒与 Agent 任务的宿主合同未就绪。页面初始化还可能因任一请求永久 pending 而一直显示加载动画。

## 2. 红灯反馈回路

- **宿主复现：** 启动真实 Desktop/Server 并读取 Todo `/status`。
- **红灯证据：** `Could not register todolist.reminder: No handler registered for \"task:register-handler\"`。
- **顺序回归：** `<Path>tests/server-port-ownership.test.ts</Path>` 在修复前证明 TaskRegistry handler 的源码位置晚于 `engine.initPlugins`。
- **页面回归：** 注入永不 resolve 的 SDK fetch，修复前 30ms 后仍存在 `.spinner`。

## 3. 最小复现

1. 启动真实 Server/Desktop。
2. 等待 builtin Todo plugin 完成 `onload`。
3. 请求 Todo `/status`。
4. 观察 `runtime.taskBackend=backend_unavailable`，日志稳定出现缺少 `task:register-handler`。

移除 UI、用户旧插件副本和外部网络后仍可复现；直接请求 Todo CRUD routes 则成功，因此最小失败接缝是 plugin lifecycle 与 host TaskRegistry 的初始化顺序。

## 4. 假设与证伪

| 假设 | 预测 | 实验 | 结果 |
|---|---|---|---|
| Todo Store 不可写 | `/status` 同时报告 store 不可写，CRUD 失败 | 真实 routes + disk Store | rejected：CRUD 成功且 store writable |
| Todo 插件未加载 | 页面/routes 均 404 | builtin inventory 与 status | rejected：插件和 routes 已加载 |
| 用户旧插件覆盖 builtin | 使用旧 manifest/runtime | 检查 PluginManager 优先级和 dev HANA_HOME | rejected：builtin 优先且 dev home 无副本 |
| TaskRegistry 注册晚于 plugin onload | handler 注册失败，移动顺序后 ready | ordering red test + real restart | confirmed |
| UI 永久 loading 独立存在 | fetch 永不 resolve 时 spinner 永久存在 | browser red test | confirmed secondary defect |

## 5. 已确认根因

`<Path>server/index.ts</Path>` 先调用 `engine.initPlugins`，后注册 `registerTaskRegistryBusHandlers`。Todo 在插件 `onload` 中注册并恢复持久化 reminder/agent handler，因此三次重试都发生在宿主监听器安装之前，最终把任务后台标记为不可用。页面侧又使用无超时的 `Promise.all` 初始化，放大为永久 loading。

基础 CRUD 路由、Store v2 和持久化文件均可工作，排除了数据库不可写、路由缺失和插件未加载。用户目录中的旧插件副本被 builtin 优先级遮蔽，也不是当前故障来源。

## 6. 修复契约

- TaskRegistry bus handler 必须早于任何插件生命周期注册。
- 复用现有 Todo/Project Store、routes 和 application/domain 层，不改变 schema。
- 页面所有 SDK 请求必须有确定的失败出口，卸载时取消 pending 请求。
- 用真实路由和磁盘 Store 覆盖 Todo 与 Project CRUD；用真实 Desktop plugin surface 覆盖页面 Todo CRUD。
- 不删除用户数据，不引入第二套调度器，不扩大到 commit/push/release。

## 7. 清理

- 没有加入临时调试插桩或一次性生产脚本。
- 真实 E2E 创建的 Todo 已永久删除。
- Desktop dev server 保留运行以供用户验收；它不是仓库产物。
