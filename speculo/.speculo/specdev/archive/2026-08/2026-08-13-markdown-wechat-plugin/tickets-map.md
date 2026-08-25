---
schema_version: 3
artifact: tickets-map
change: 2026-08-13-markdown-wechat-plugin
status: completed
---

# Tickets Map: Markdown 公众号排版内置插件

- **Map：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/tickets-map.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/spec.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/</Path>`
- **Goal Plan：** `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/goal-plan.md</Path>`

## 1. 目标与拆分策略

本 Map 将 US-001～US-008 与 AC-001～AC-018 拆成七张有真实依赖的垂直 Ticket。T-01 先建立可加载的插件盒与共享私有数据合同；T-02 交付 Markdown 编辑、渲染、主题和 Page/Widget 入口；T-03 交付用户手势剪贴板与 Page/Widget 浏览器下载；T-04 交付 ResourceIO 导入与显式工作区写回；T-05 交付 Agent 纯产出与 SessionFile；T-06 交付策略扫描、诊断和可删除 smoke；T-07 汇合全部行为并完成构建、类型、回归和发布证据。

不需要宿主 prefactor 或 expand-contract：现有 PluginManager、Plugin SDK、ResourceIO、浏览器 surface session 和 SessionFile tool context 足以承载已修订行为。所有产品实现、插件测试和资产仅写 `<Path>plugins/markdown-wechat/**</Path>`；票之间通过串行依赖避免共享写入冲突。

## 2. 执行清单

| ID | Ticket | 可观察产出 | Blocked By | Depth | Risk | Ready | Owner | Contract IDs | Wave/Gate | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/ticket/01-establish-plugin-shell-private-store.md</Path>` | 内置插件可加载，Page/Widget route 和私有 versioned envelope 可恢复 | — | deep | high | yes | root | AC-001、AC-002、AC-011、AC-012 | W1 / G1 根契约 | done |
| T-02 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/ticket/02-deliver-editor-renderer-surfaces.md</Path>` | Page 编辑器、核心 Markdown 预览、主题/字号/字体和窄布局 | T-01 | standard | high | yes | root | AC-002、AC-003、AC-004、AC-009、AC-012 | W2 / G2 编辑预览 | done |
| T-03 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/ticket/03-deliver-clipboard-and-browser-download.md</Path>` | 富文本复制、源码回退、Markdown/HTML 浏览器下载 | T-02 | standard | high | yes | root | AC-005、AC-006、AC-008、AC-009 | W3 / G2 产出交付 | done |
| T-04 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/ticket/04-deliver-resource-import-and-explicit-writeback.md</Path>` | ResourceIO 导入、读取失败保留草稿、显式版本写回 | T-01 | deep | high | yes | root | AC-007、AC-010、AC-014 | W4 / G3 资源边界 | done |
| T-05 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/ticket/05-deliver-agent-render-session-output.md</Path>` | Markdown/ResourceRef 纯产出 tool，带 session 时交付 HTML SessionFile | T-02 | deep | high | yes | root | AC-013、AC-014、AC-015 | W3 / G3 Agent 产出 | done |
| T-06 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/ticket/06-deliver-policy-diagnostics-and-removal.md</Path>` | 无网络/迁移违规、Plugin diagnostics/scenario 与整块删除验证 | T-02、T-05 | standard | high | yes | root | AC-001、AC-016、AC-017、AC-018 | W5 / G4 宿主边界 | done |
| T-07 | `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/ticket/07-release-integrated-markdown-wechat-plugin.md</Path>` | 全部合同汇合，构建/typecheck/test、桌面 smoke 和发布证据完整 | T-02、T-03、T-04、T-05、T-06 | deep | critical | yes | root | AC-001～AC-018 | W6 / G5 发布 Gate | done |

Ticket frontmatter 是状态、依赖、深度和路径访问契约的权威；本表只作同步投影。由于所有 Ticket 的产品写入边界均为同一插件根，Map 中依赖边是串行 owner 交接，不安排并行代码写入。

## 3. 依赖 DAG

```text
T-01 [READY, plugin shell/private store]
  ├─→ T-04 [ResourceIO import/writeback]
  └─→ T-02 [editor/renderer/surfaces]
        ├─→ T-03 [clipboard/browser download]
        └─→ T-05 [Agent render/SessionFile]
              └─→ T-06 [policy/diagnostics/removal]
        
T-02 ─→ T-03
T-02, T-03, T-04, T-05, T-06 ─→ T-07 [integrated release]
```

T-04 只依赖 T-01 的 plugin shell/private data contract；T-05 消费 T-02 renderer，T-06 消费 Page 与 tool 场景。Goal Plan 采用 current workspace 后全部 Ticket 仍严格串行，避免插件根交叉写入。

## 4. 合同覆盖矩阵

| Contract ID | 覆盖 Ticket | 验证接缝 | 状态 | 说明 |
|---|---|---|---|---|
| AC-001 | T-01、T-06、T-07 | PluginManager diagnostics/build/removal | covered | 内置加载与删除完整性 |
| AC-002 | T-01、T-02、T-07 | Page/Widget route + Playwright | covered | 两个 surface 同源 |
| AC-003 | T-02、T-07 | renderer contract tests | covered | 核心 Markdown 与安全降级 |
| AC-004 | T-02、T-07 | UI/Playwright visual smoke | covered | 主题、布局、无重叠 |
| AC-005 | T-03、T-07 | browser ClipboardItem smoke | covered | HTML+plain text |
| AC-006 | T-03、T-07 | permission/API failure injection | covered | 不虚报成功 |
| AC-007 | T-04、T-07 | ResourceIO read/picker fixture | covered | 导入与拒绝 |
| AC-008 | T-03、T-07 | browser download fixture | covered | Page/Widget 浏览器下载 |
| AC-009 | T-02、T-03、T-07 | renderer/media/no-network tests | covered | 本地媒体占位 |
| AC-010 | T-04、T-07 | ResourceIO conflict integration | covered | 显式版本写回 |
| AC-011 | T-01、T-07 | private store reload fixture | covered | schema envelope 恢复 |
| AC-012 | T-01、T-02、T-07 | Page/Widget shared-store smoke | covered | Widget 不分叉状态 |
| AC-013 | T-05、T-07 | plugin tool invocation | covered | Markdown input + SessionFile |
| AC-014 | T-04、T-05、T-07 | ResourceRef/tool integration | covered | 不接受绝对路径 |
| AC-015 | T-05、T-07 | invalid-input tool tests | covered | 不产生文件/副作用 |
| AC-016 | T-06、T-07 | static policy scan | covered | 无网络/旧迁移/custom route |
| AC-017 | T-06、T-07 | isolated removal build smoke | covered | 可整块删除 |
| AC-018 | T-06、T-07 | diagnostics/scenario | covered | 诊断和开发场景 |

无 `uncovered` 或 `deferred` 合同。

## 5. 并行与路径所有权

- 最大并发来自 `<Path>{roots.state}/specdev/config.json</Path>`；本 change 不用并发上限覆盖共享插件根的写入冲突。
- T-01～T-07 的唯一产品写入 owner 在各自执行阶段，授权范围均为 `<Path>plugins/markdown-wechat/**</Path>`；后续票必须读取前序 Evidence 后接管。
- `shared_paths` 与 `shared_path_owners` 在各 Ticket 中为空；不存在宿主或根依赖修改授权。
- 参考 `<Path>temp/md-wechat/</Path>`、Hana SDK、PluginManager、公共测试与构建脚本均只读。

| Ticket A | Ticket B | Writable 交集 | 真实依赖 | 处理 |
|---|---|---|---|---|
| 任意 T-N | 任意后续 T-M | `<Path>plugins/markdown-wechat/**</Path>` | 是，DAG 传递依赖 | 串行执行，后续票读取前序 Evidence |

## 6. Gate、Wave 与集成点

- **G1 根契约：** T-01 验证内置发现、surface、私有 envelope 和可恢复错误。
- **G2 用户闭环：** T-02～T-03 验证编辑、预览、主题、复制和下载。
- **G3 资源/Agent 边界：** T-04 与 T-05 验证 ResourceIO、版本冲突、ResourceRef 和 SessionFile。
- **G4 宿主策略：** T-06 验证无网络/迁移违规、diagnostics/scenario 和删除 smoke。
- **G5 发布：** T-07 汇合所有合同并运行适用构建、类型、插件测试、桌面 E2E 和路径审计。

正式跨 Ticket 编排由 v6 Goal Plan 负责；current workspace 下由 root 作为 Lead/implementation owner 严格串行推进。

## 7. 横切契约与风险

- UI 导出只生成浏览器下载，不注册 SessionFile；Agent tool 只有 session context 时才注册 SessionFile。
- 用户资源只经 ResourceIO；插件私有 envelope 与用户资源身份不可混淆；显式写回使用版本冲突保护。
- v1 不声明 `network.fetch`，不访问旧浏览器数据库，不创建第三方上传任务。
- 所有失败必须可观察、保留草稿、不伪造 `file://`/`MEDIA:`/SessionFile。
- Page/Widget 与 Agent 复用同一 renderer；Widget 不维护第二份编辑器状态。

## 8. 同步规则

- Ticket 状态变化后同步本清单；Ticket frontmatter 是权威。
- ID、路径、依赖、合同覆盖或所有权变化后运行 `<Path>{roots.workflows}/specdev/common/tools/validate-specdev.mjs</Path>`。
- 每张完成票写入 `<Path>{roots.state}/specdev/changes/2026-08-13-markdown-wechat-plugin/evidence/T-NN.md</Path>`；Evidence 不完整不得标 `done`。
- 越出 `<Path>plugins/markdown-wechat/**</Path>` 前必须停止并走 deviation control。
