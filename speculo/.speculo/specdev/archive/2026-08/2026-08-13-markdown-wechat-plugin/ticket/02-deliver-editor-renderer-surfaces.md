---
schema_version: 3
artifact: ticket
change: 2026-08-13-markdown-wechat-plugin
id: T-02
title: 交付编辑器渲染器与 Page/Widget 工作面
status: done
planning_depth: standard
planning_depth_reason: 跨 UI bundle、Markdown renderer、主题设置和响应式布局，但沿用 T-01 已锁定的 surface/private-store 接缝且无宿主公共 API 变化。
ready: true
risk: high
blocked_by: [T-01]
contract_ids: [AC-002, AC-003, AC-004, AC-009, AC-012]
owner: root
expected_changes: ["<Path>plugins/markdown-wechat/routes/page.ts</Path>", "<Path>plugins/markdown-wechat/routes/widget.ts</Path>", "<Path>plugins/markdown-wechat/src/editor/**</Path>", "<Path>plugins/markdown-wechat/src/renderer/**</Path>", "<Path>plugins/markdown-wechat/src/theme/**</Path>", "<Path>plugins/markdown-wechat/src/components/surfaces/**</Path>", "<Path>plugins/markdown-wechat/assets/ui/**</Path>", "<Path>plugins/markdown-wechat/tests/renderer.test.ts</Path>", "<Path>plugins/markdown-wechat/tests/surfaces.test.ts</Path>"]
writable_paths: ["<Path>plugins/markdown-wechat/routes/page.ts</Path>", "<Path>plugins/markdown-wechat/routes/widget.ts</Path>", "<Path>plugins/markdown-wechat/src/editor/**</Path>", "<Path>plugins/markdown-wechat/src/renderer/**</Path>", "<Path>plugins/markdown-wechat/src/theme/**</Path>", "<Path>plugins/markdown-wechat/src/components/surfaces/**</Path>", "<Path>plugins/markdown-wechat/assets/ui/**</Path>", "<Path>plugins/markdown-wechat/tests/renderer.test.ts</Path>", "<Path>plugins/markdown-wechat/tests/surfaces.test.ts</Path>"]
read_only_paths: ["<Path>plugins/markdown-wechat/manifest.json</Path>", "<Path>core/plugin-manager.ts</Path>", "<Path>packages/plugin-sdk/src/index.ts</Path>", "<Path>temp/md-wechat/src/lib/renderer.js</Path>", "<Path>temp/md-wechat/tests/renderer.test.js</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-02: 交付编辑器渲染器与 Page/Widget 工作面

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/ticket/02-deliver-editor-renderer-surfaces.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-02.md</Path>`

## 1. 战略与来源

- **目标：** 在 T-01 surface/private store 上交付 Markdown 编辑、公众号风格实时预览、主题/字号/字体和 Page/Widget 可观察布局。
- **可观察产出：** 用户输入核心 Markdown 后预览同步更新；切换主题/字号/字体只改变展示；桌面和窄窗口无重叠；Widget 显示摘要并可进入 Page。
- **来源：** US-001、US-002、US-006、AC-002、AC-003、AC-004、AC-009、AC-012、`<Path>temp/md-wechat/src/lib/renderer.js</Path>`。
- **当前事实：** root 已有 `markdown-it`、CodeMirror Markdown 和 React/Vite；参考 renderer 行为可作为测试意图但不复用浏览器存储/图床。
- **Planning Depth 原因：** UI 与渲染器跨层但没有公共协议改变；核心行为错误会直接影响公众号文章内容，故为 Standard/high。

## 2. 决策状态

### 已锁定决策

- 核心语法包括标题、段落、强调、删除线、链接、列表、嵌套引用、代码块、表格、分割线、图片和视频占位。
- 未支持或危险 HTML 必须安全降级；源 Markdown 始终可继续编辑。
- Page 是唯一完整编辑器状态；Widget 只读同一 private store 的摘要和入口。

### 已采用的低影响假设

- renderer 可使用仓库已有 `markdown-it` 配置和插件内纯函数模块；主题数量按关键行为覆盖，不承诺 26 套像素复刻。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| editor state、renderer、theme/font controls、preview layout、media placeholder、Page/Widget UI tests | T-01 routes/store、Hana theme/css、CodeMirror/markdown-it、参考项目行为意图 | Clipboard/download、ResourceIO、Agent tool、第三方媒体上传、多文档管理 |

## 4. 要构建什么

用户在 Page 输入 Markdown，编辑区保持稳定尺寸，预览区同步渲染为清理后的公众号 HTML。主题、字体和字号变更立即作用于预览而不改写源文；图片/视频使用本地可访问预览或显式占位，不触发网络上传。窄窗口下布局可以纵向或折叠，但工具栏、错误提示和内容不能互相覆盖。Widget 通过同一 store 显示标题/摘要和打开 Page 动作。

## 5. 实现契约

- **入口或接缝：** Page/Widget assets、renderer interface、private store adapter、Playwright/component tests。
- **输入与输出：** Markdown string + theme settings -> sanitized preview HTML + plain text/diagnostic metadata；Widget -> summary/navigation.
- **公共接口变化：** 仅插件内部 renderer/store 模块，不新增宿主接口。
- **不变量：** renderer 不写文件、不发网络；source Markdown 不因主题变化改变；Widget 不创建第二编辑器 state。
- **状态或数据流：** CodeMirror/editor change -> debounce render -> preview; settings change -> theme projection; save -> T-01 envelope.
- **错误与失败行为：** parser/highlighter/invalid theme 异常转为安全降级或可见错误；不把未清理 HTML 注入 preview。
- **兼容要求：** Hana theme inheritance、iframe route shell、桌面 Chromium 和窄宽度。
- **安全与隐私要求：** 清理危险标签/属性和 javascript URL；本地媒体不转成公网 URL。

## 6. 执行路线

1. 为 renderer 和核心语法建立红灯测试，冻结结构化 HTML 与危险输入降级断言。
2. 接入 CodeMirror/Markdown editor 与稳定 debounce render，建立 Page 双栏或窄布局。
3. 加入 theme/font/fontSize controls 和本地媒体占位，确保设置只影响 presentation。
4. 让 Widget 读取 T-01 private summary 并导航 Page，不复制 editor state。
5. 运行 renderer、surface、窄布局和 accessibility smoke，形成 Evidence。

## 7. 路径访问契约

- **预计修改点：** `<Path>plugins/markdown-wechat/src/**</Path>`、`<Path>plugins/markdown-wechat/assets/**</Path>`、`<Path>plugins/markdown-wechat/routes/page.ts</Path>`、`<Path>plugins/markdown-wechat/routes/widget.ts</Path>` 和插件内 tests。
- **可写范围：** frontmatter `writable_paths` 列出的 editor/renderer/theme/surfaces/assets/ui 与测试路径；其它插件路径只读。
- **只读上下文：** `<Path>plugins/markdown-wechat/manifest.json</Path>`、`<Path>core/plugin-manager.ts</Path>`、`<Path>packages/plugin-sdk/src/index.ts</Path>`、`<Path>temp/md-wechat/src/lib/renderer.js</Path>`、`<Path>temp/md-wechat/tests/renderer.test.js</Path>`。
- **共享路径：** 无；T-01 已交付插件根，T-02 依赖其 Evidence。
- **保留或不动：** 宿主渲染器、公共依赖、参考项目源代码。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | renderer contract | `npx vitest run <Path>plugins/markdown-wechat/tests/renderer.test.ts</Path>` | 核心语法、主题和媒体占位输出稳定 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-02.md</Path>` |
| 失败路径 | sanitizer/parser fixture | 同一测试输入危险 HTML、javascript URL、无效主题 | 安全降级，源文不丢失，错误可观察 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-02.md</Path>` |
| UI E2E（owner：当前执行 owner） | Page/Widget Playwright | 打开桌面/窄 viewport，编辑、切换主题、Widget 导航 | 预览实时更新、无重叠、Widget 无第二编辑器 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-02.md</Path>` |
| 回归 | TypeScript/UI test | `npx vitest run <Path>plugins/markdown-wechat/tests/surfaces.test.ts</Path>` | Page/Widget route 和 T-01 store 合同不回归 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-02.md</Path>` |

- **Workspace checks：** Lead 在 current workspace 使用 Node 24 运行 renderer/surface 测试、插件 typecheck/build/verify 和定向样式检查。
- **E2E disposition：** required：真实 iframe 中的编辑、预览、主题、Widget 导航与窄屏布局无法仅由 Node 测试证明。
- **E2E owner/environment：** Lead / current-workspace；desktop 与 narrow viewport 打开真实 Page/Widget，验证预览更新、无重叠和单一编辑状态。
- **Integration evidence：** 记录 implementation commit、parent before、direct-parent 回归/E2E 与 result SHA。

## 9. 发布、迁移与恢复

- **迁移顺序：** 无新持久数据迁移；使用 T-01 envelope。
- **兼容窗口：** 主题增加必须保留默认主题和未知主题安全回退。
- **监控信号：** renderer error、preview fallback、surface layout error。
- **回滚或前向恢复：** renderer/asset 失败保留 source Markdown；可回退默认主题和空 preview。
- **不可逆操作与批准点：** 无。
- **收缩条件：** AC-003/004/009 和 Page/Widget smoke 通过后才能开始 T-03 产出交付。

## 10. 验收标准

- [x] AC-002、AC-003、AC-004、AC-009、AC-012：编辑、预览、主题、媒体占位、Page/Widget 共享状态通过。
- [x] 验证矩阵写入 `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-02.md</Path>`。
- [x] 代码、资产和测试未超出 `<Path>plugins/markdown-wechat/**</Path>`。
