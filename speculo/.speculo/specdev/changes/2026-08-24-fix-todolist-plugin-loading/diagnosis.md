---
schema_version: 1
artifact: diagnosis
change: 2026-08-24-fix-todolist-plugin-loading
status: root-cause-confirmed
feedback_loop_ready: true
red_command: "HANA_TODO_E2E_URL=<real-host-page> npx playwright test --config tests/e2e/playwright.config.ts --project=desktop --grep 'zh-CN: manual'"
red_evidence: "Real-host Playwright rendered Request failed (403); created Todo never appeared within 10 seconds."
cleanup_status: clean
updated_at: 2026-08-24T11:31:02+08:00
---

# Diagnosis: Todo 插件页面持续加载且操作无响应

## 1. 现象与影响

Todo 页签显示宿主 iframe 加载 spinner。直接打开插件 Page 后页面壳可见，但 Todo 查询与创建返回 403，手动 CRUD 不可用。插件 lifecycle、routes、静态资源和 Store 本身可加载。

## 2. 红灯反馈回路

- **命令：** 在 `<Path>plugins/todolist/</Path>` 中，以当前运行 Hana 服务的真实 Page URL 执行单个 zh-CN desktop Playwright CRUD 用例。
- **至少一次真实输出：** 用例在 10.2 秒失败；页面错误为 `Request failed (403)`；目标 `.todo-title` 不存在。
- **精确症状断言：** Page 可以呈现，但创建 Todo 后列表无响应，API 鉴权失败。
- **耗时：** 约 11 秒。
- **确定性/复现率：** 1/1。
- **Agent 可运行性：** autonomous。
- **无法建立时已尝试方式和所需输入：** 不适用。

## 3. 最小复现

- **环境与输入：** 当前本地 Hana server、真实 `<Path>plugins/todolist/routes/page.ts</Path>` Page、loopback Page token。
- **剩余步骤：** 打开 Page，输入一个 Todo，点击添加，观察页面错误。
- **逐项删除证据：** lifecycle、Page、asset、status API 分别可在有正确凭证时返回 200；删除 SDK/surface-session API 适配后请求稳定为 403。
- **最后红灯证据：** `<Path>plugins/todolist/tests/e2e/real-host.spec.ts</Path>` 的 CRUD 可观察断言失败。
- **捕获物：** 无；Playwright trace 位于运行时临时目录，不持久化敏感 URL。

## 4. 假设与证伪

| 排名 | 假设与预测 | 支持证据 | 单变量实验 | 结果 |
|---|---|---|---|---|
| 1 | Page 未接入官方 SDK，fallback fetch 丢失 surface session，预测 API 为 403 | Page 只加载本地 JS；`window.hana` 未注入 | 无凭证 API 为 403，带 surface session 为 200 | confirmed |
| 2 | ready 消息格式不受宿主识别，预测外层 spinner 不会立即退出 | 插件发送 `type: hana:ready`，宿主只接受 legacy `ready` 或正式协议 `hana.ready` | 对照宿主 parser 与 SDK event envelope | confirmed |
| 3 | 插件 lifecycle 或 Store 阻塞，预测 Page/status/asset 请求超时或失败 | 启动日志显示插件 637ms 加载完成 | pages、iframe-ticket、Page、asset、status 请求均在毫秒级返回 200 | rejected |

## 5. 已确认根因

- **触发条件：** Hana 宿主通过带 `pluginSurfaceSession` 的 iframe URL 打开 Todo Page。
- **失败机制：** `<Path>plugins/todolist/src/ui/page.tsx</Path>` 未创建或注入 `@hana/plugin-sdk`；`<Path>plugins/todolist/src/ui/browser-app.ts</Path>` 因而使用会丢失 surface session 的普通相对 fetch，并发送宿主不识别的 raw ready/resize 消息。
- **根因位置：** `<Path>plugins/todolist/src/ui/page.tsx</Path>`、`<Path>plugins/todolist/src/ui/browser-app.ts</Path>`、`<Path>plugins/todolist/build.ts</Path>`。
- **漏检原因：** 现有 Node 测试覆盖 Page HTML和领域行为，却没有验证构建资产携带 SDK 协议；真实宿主 E2E 入口未强制使用 surface session。
- **为何排除其他候选：** 插件装载、静态资源、Store 和正确鉴权后的 API 均已直接验证为健康。
- **确认实验：** 同一 status API 无凭证返回 403，带 surface session 返回 200；Playwright 页面显示相同 403。

## 6. 修复契约

- **必须改变：** Page 注入官方 SDK；API、ready、resize 和 Resource Picker 统一通过 SDK；初始页面壳渲染后立即 ready；构建不得产生无 SDK 的退化资产。
- **必须保持：** Todo 数据模型、Store schema、routes/tools、五语言 UI、插件 ID 和现有 CRUD 语义不变。
- **正确测试 seam：** `<Path>plugins/todolist/tests/contract.test.ts</Path>` 与 `<Path>plugins/todolist/tests/e2e/real-host.spec.ts</Path>`。
- **回归测试：** 构建产物包含正式 SDK surface header/ready 协议；真实宿主 Page 不出现 401/403，并通过 CRUD。
- **OUT：** 宿主代码、TaskRegistry 注册问题、数据迁移、提交、推送和发布。
- **风险与回滚：** 风险限于 Page bundle；回滚为恢复上一版插件资产和源码，Todo Store 不变。
- **推荐下游：** I-implement Direct Spec。

## 7. 清理

- **原始回路重跑：** 实现后执行。
- **`[DEBUG-...]` 搜索：** 无临时插桩。
- **一次性脚本/原型：** Playwright 输出仅写系统临时目录。
- **未清理项 owner 与删除条件：** 无。
