---
schema_version: 3
artifact: ticket
change: 2026-08-13-markdown-wechat-plugin
id: T-03
title: 交付富文本剪贴板与浏览器下载
status: ready
planning_depth: standard
planning_depth_reason: 涉及浏览器权限、用户手势、ClipboardItem 回退和 Page/Widget 文件下载，但不改变宿主协议；行为失败必须可见。
ready: true
risk: high
blocked_by: [T-02]
contract_ids: [AC-005, AC-006, AC-008, AC-009]
owner: unassigned
expected_changes: ["<Path>plugins/markdown-wechat/src/clipboard/**</Path>", "<Path>plugins/markdown-wechat/src/download/**</Path>", "<Path>plugins/markdown-wechat/src/components/actions/**</Path>", "<Path>plugins/markdown-wechat/tests/clipboard.test.ts</Path>", "<Path>plugins/markdown-wechat/tests/download.test.ts</Path>"]
writable_paths: ["<Path>plugins/markdown-wechat/src/clipboard/**</Path>", "<Path>plugins/markdown-wechat/src/download/**</Path>", "<Path>plugins/markdown-wechat/src/components/actions/**</Path>", "<Path>plugins/markdown-wechat/tests/clipboard.test.ts</Path>", "<Path>plugins/markdown-wechat/tests/download.test.ts</Path>"]
read_only_paths: ["<Path>plugins/markdown-wechat/src/renderer/**</Path>", "<Path>packages/plugin-sdk/src/index.ts</Path>", "<Path>desktop/src/react/plugin-ui/capabilities.ts</Path>", "<Path>temp/md-wechat/src/lib/clipboard.js</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-03: 交付富文本剪贴板与浏览器下载

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/ticket/03-deliver-clipboard-and-browser-download.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-03.md</Path>`

## 1. 战略与来源

- **目标：** 让用户在 Page 通过用户手势复制公众号富文本，并从 Page/Widget 下载 Markdown/HTML；复制与下载失败必须提供可用替代路径。
- **可观察产出：** ClipboardItem 写入 HTML+plain text 成功才显示成功；不支持/拒绝时尝试 selection 回退，失败不虚报；导出下载文件内容、MIME 和稳定文件名正确。
- **来源：** US-003、US-004、AC-005、AC-006、AC-008、AC-009、ADR-006、`<Path>temp/md-wechat/src/lib/clipboard.js</Path>`。
- **当前事实：** Hana UI capability 只有 `clipboard.writeText`；富文本 ClipboardItem/selection 可在 iframe 用户手势中实现；Page/Widget 没有 SessionFile identity，浏览器下载是已确认交付。
- **Planning Depth 原因：** 浏览器权限/API 差异和用户数据交付错误会直接导致假成功或丢产物，需 Standard 验证和故障注入。

## 2. 决策状态

### 已锁定决策

- ClipboardItem 优先，selection/contenteditable 回退；`hana.clipboard.writeText` 只用于源码/纯文本降级和 capability 诊断。
- Page/Widget Markdown/HTML 通过 Blob + 浏览器下载交付，不注册 SessionFile、不写工作区。
- HTML 复制前清理元数据和危险媒体引用；本地不可访问媒体保留占位。

### 已采用的低影响假设

- 目标桌面 Chromium 支持用户手势创建 Blob URL 和下载；若下载 API 被阻断，UI 显示失败并保留复制源码/HTML 的替代动作。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| clipboard adapter、download adapter、Page actions、Widget download action、permission/failure tests | T-02 renderer output、`hana.clipboard.writeText`、ClipboardItem/selection 浏览器 API | SessionFile 创建、宿主新 capability、第三方媒体上传、工作区写回 |

## 4. 要构建什么

用户点击“复制排版”时，动作保持在 user gesture 上下文，插件准备清理后的 HTML 和 plain text，按 ClipboardItem -> selection fallback 顺序执行。只有写入调用成功才反馈成功；失败显示明确状态，并提供“复制源码”和“导出 HTML”。用户点击导出时生成 Markdown 或 HTML Blob，触发浏览器下载，文件名按文档标题安全化并带正确扩展名/MIME；浏览器下载不可用时不修改草稿且显示可恢复错误。

## 5. 实现契约

- **入口或接缝：** Page/Widget button handlers、renderer HTML、browser Clipboard API、Blob/download anchor、Playwright download/permission controls。
- **输入与输出：** sanitized HTML + plain text -> clipboard payload；Markdown/HTML string -> downloaded file metadata/content。
- **公共接口变化：** 无；manifest 仅声明已使用 `clipboard.writeText` 和 resource picker capability。
- **不变量：** 富文本成功不等同纯文本成功；下载不是 SessionFile；不返回 `file://`/`MEDIA:`/裸路径；不改 workspace。
- **状态或数据流：** action -> prepare payload -> primary adapter -> fallback -> success/failure; export -> Blob -> download -> status.
- **错误与失败行为：** permission denied/API unavailable/fallback failure 显示错误和替代动作；下载失败不生成伪成功记录。
- **兼容要求：** Chromium iframe、窄窗口、用户手势、Hana theme/toast。
- **安全与隐私要求：** 不把外部 URL 或本地绝对路径上传；HTML payload 经过 sanitizer。

## 6. 执行路线

1. 写 ClipboardItem、selection fallback 和 download adapter 的正常/失败红灯测试。
2. 将 adapters 接入 Page actions，分别绑定富文本复制、源码复制、Markdown 下载和 HTML 下载。
3. 接入 Widget 的轻量下载/打开 Page 行为，确保不创建第二状态。
4. 用 Playwright 在允许、拒绝、API 缺失和窄 viewport 条件下验证可观察状态。
5. 形成下载文件内容/MIME/复制 payload Evidence。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/markdown-wechat/src/clipboard/**</Path>`、`<Path>plugins/markdown-wechat/src/download/**</Path>`、UI assets 和插件内 tests。
- **可写范围：** frontmatter `writable_paths` 列出的 clipboard/download/actions 与测试路径；Page shell 和 renderer 只读。
- **只读上下文：** `<Path>plugins/markdown-wechat/src/renderer/**</Path>`、`<Path>packages/plugin-sdk/src/index.ts</Path>`、`<Path>desktop/src/react/plugin-ui/capabilities.ts</Path>`、`<Path>temp/md-wechat/src/lib/clipboard.js</Path>`。
- **共享路径：** 无；依赖 T-02 renderer。
- **保留或不动：** Plugin protocol、宿主 clipboard capability、根依赖和 workspace resource files。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常复制 | browser ClipboardItem integration | `npx vitest run <Path>plugins/markdown-wechat/tests/clipboard.test.ts</Path>` + Playwright user gesture | 同时写入 text/html 与 text/plain，成功提示准确 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-03.md</Path>` |
| 复制失败 | permission/API failure injection | 禁用 ClipboardItem/selection 或拒绝权限 | 不报告成功，提供源码复制/HTML 下载 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-03.md</Path>` |
| 正常下载 | browser download smoke | 点击 Markdown/HTML 导出并读取下载文件 | 内容、MIME、扩展名正确，不写 workspace | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-03.md</Path>` |
| 回归 | UI renderer test | `npx vitest run <Path>plugins/markdown-wechat/tests/download.test.ts</Path>` | 下载动作不改变 source/theme/private state | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-03.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** 不适用：只生成临时 Blob/download，不改变数据 schema。
- **兼容窗口：** ClipboardItem 不支持时保留 selection fallback；下载 API 不可用时保留源码复制和错误状态。
- **监控信号：** copy adapter selected/failed、download status、permission denial；日志脱敏。
- **回滚或前向恢复：** 删除 UI action 不影响私有草稿；失败不删除 source 或 settings。
- **不可逆操作与批准点：** 无。
- **收缩条件：** AC-005/006/008 的浏览器 Evidence 完整后交给 T-07 汇合。

## 10. 验收标准

- [ ] AC-005、AC-006、AC-008、AC-009：复制、回退、浏览器下载和媒体占位通过。
- [ ] Evidence 记录到 `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-03.md</Path>`。
- [ ] 不使用新增宿主 capability，不创建 SessionFile，不写 workspace。
