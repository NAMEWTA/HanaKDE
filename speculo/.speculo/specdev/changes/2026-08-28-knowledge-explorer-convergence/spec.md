---
schema_version: 3
artifact: spec
change: 2026-08-28-knowledge-explorer-convergence
status: ready
ready_for_tickets: true
sources:
  - USER-DECISION:执行已批准的 Knowledge Explorer 收敛计划
  - CODE:desktop/src/react/components/knowledge-workspace
  - CODE:desktop/src/react/components/desk
---

# Spec: Knowledge Explorer 与工作台资源链路收敛

- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-28-knowledge-explorer-convergence/spec.md</Path>`

## 1. 问题与目标

Knowledge Renderer 知道当前 Desk 的目录或 mount，但 Knowledge HTTP/ResourceIO 请求没有携带该身份；Server 只从当前 session/engine 推断 main root。没有可推断 session 时，Desk 能显示而 Knowledge 返回来源不可用。页面同时把搜索、Explorer、编辑器和 Current Resource Views 固定为三栏，形成与 upstream 工作台明显不一致的稀疏管理台。

目标用户是在 Knowledge 中浏览、编辑、整理当前工作台真实目录的桌面用户。成功状态是 Knowledge 与 Desk 指向同一工作区，并直接复用 Desk Explorer、PreviewPanel、标签页、编辑保存、文件监控和文件命令状态；Knowledge 不再维护一套平行的主工作台实现。

非目标：不替换索引或回收站数据模型；不新增插件或第三方 Tree/编辑器库；不为 Knowledge 复制一套新的文件编辑器和资源命令状态机。

## 2. 解决方案与外部行为

Renderer 为全部 Knowledge 和 knowledge-address ResourceIO 请求附加规范化 workspace selector。Server 只接受经现有 files scope、local-owner 与 approved-dir/mount 能力校验的 selector，并以该 selector 创建和缓存 main SourceRegistry。Knowledge 主工作面直接组合既有 DeskSection 与 PreviewPanel，共享同一 workspace store、打开标签、Markdown/代码编辑器、保存、Watch 和冲突处理；Knowledge 搜索、索引、大纲/反向链接与回收站作为按需附加面板，不再替代主 Explorer/Editor。

工作区切换必须取消旧请求、释放旧文档/Watch，并重新加载新 root。整体来源失败显示单一紧凑错误；不得伪造 available main。单根不可用不删除其他已加载根。

## 3. 用户故事

- **US-001**：作为工作台用户，我希望 Knowledge 打开当前 Desk 的真实目录，以便无需创建聊天 session 也能管理文件。
- **US-002**：作为文件整理用户，我希望 Knowledge 使用 upstream 的紧凑 Explorer，以便搜索、展开和操作大量层级文件。
- **US-003**：作为多来源用户，我希望一个来源失败时其他来源仍可浏览，并能明确重试。
- **US-004**：作为桌面用户，我希望右侧信息和回收站按需出现，以便编辑区不被空白常驻栏挤压。

## 4. 验收合同

| ID | 前置条件 | 动作或事件 | 可观察结果 | 验证接缝 |
|---|---|---|---|---|
| AC-001 | Desk 选择本地 approved directory，engine 无活动 session | 打开 Knowledge | main 来源为该目录且可展开 | HTTP route + desktop E2E |
| AC-002 | Desk 选择授权 mount | 打开 Knowledge | main 来源为同一 mount，label 和能力正确 | HTTP route + client test |
| AC-003 | 非 local owner 传绝对目录或未批准目录 | 请求 Knowledge | 返回稳定 out-of-scope，绝不读取目录 | route security test |
| AC-004 | 从目录 A 切换到 B | 保持 Knowledge 页已访问并切换 | 旧请求/Watch 不污染 B，树和文档身份切换 | component/integration test |
| AC-005 | sources 请求失败 | 渲染 Knowledge | 不伪造 available main，只出现一个紧凑错误与重试 | component test |
| AC-006 | 正常嵌套目录 | 打开 Knowledge | 左侧为 upstream 风格搜索、图标工具栏和 28px 单列树，无独立来源栏 | component + screenshot |
| AC-007 | 未打开资源 | 查看页面 | 编辑区占余量，Current Views 与回收站不常驻占宽 | component + screenshot |
| AC-008 | 新建、重命名、移动、复制、删除和恢复 | 执行操作 | 继续走 Knowledge/ResourceIO 且树即时刷新 | focused E2E |
| AC-009 | Desk 中可编辑的 Markdown/代码/CSV 文件 | 在 Knowledge 打开、编辑并保存 | 使用同一个 PreviewPanel 编辑器与保存链路，切回 Desk 后内容和标签状态一致 | desktop E2E |
| AC-010 | Explorer 中选择文件或目录 | 使用右键菜单或快捷键执行文件命令 | 剪切、复制、粘贴、重命名、删除复用 DeskTree 命令；顶部工具栏不重复放置这些上下文动作 | component + desktop E2E |
| AC-011 | 旧工作区存在 RECOVERY_REQUIRED 日志 | 打开另一个当前工作区 | 恢复状态按完整工作区身份隔离，不得因通用 sourceKey=main 禁用当前编辑 | coordinator integration test |
| AC-012 | 打开 Finance Workbench、Markdown WeChat 或 Todo 内置插件页 | 宿主取得签名 surface URL 并加载 iframe 资源 | iframe 只在真实 load/handshake 后进入 ready；`file://` 桌面宿主可加载短时签名资源且页面不再无限转圈 | plugin route + host component + real desktop |

## 5. 范围

### IN

- Knowledge workspace selector client/server contract、registry cache identity 与安全校验。
- Knowledge 共享工作台 shell、错误退化、按需 Current Views/Trash。
- 内置插件 iframe 生命周期与 asset-session 资源授权链路。
- 相关 unit/component/route/E2E 与截图检查。

### REUSE

- DeskSection、DeskToolbar、DeskTree 的组件、store 和文件命令实现。
- PreviewPanel 的标签页、Markdown/代码/CSV 编辑、保存、Watch 和冲突处理。
- SourceRegistry、ResourceIO 与 Knowledge 索引/回收站能力作为附加功能。

### OUT

- **OOS-001**：不修改知识地址、索引或回收站持久化 schema。
- **OOS-002**：不新增外部 Tree/编辑器依赖。
- **OOS-003**：不为同一当前工作区保留两套 Explorer、剪贴板或编辑会话实现。

## 6. 已锁定实现约束

- **DEC-001**：selector 只选择已授权工作区；local path 仅 local owner 且必须通过现有 approved-dir 规则。
- **DEC-002**：所有使用 knowledge source address 的 Knowledge HTTP 与 ResourceIO 请求使用同一 selector。
- **DEC-003**：不得以伪造 DTO 掩盖 sources 失败。
- **DEC-004**：Explorer 和 Editor 必须复用 upstream 的真实组件、store 与 actions，不只复制结构或 CSS。
- **DEC-005**：当前工作区的文件命令以 DeskTree/ResourceIO 为唯一 owner；Knowledge 专属状态不得阻断同一工作区的基础编辑能力。
- **DEC-006**：操作恢复身份必须包含具体 workspace selector/root identity，禁止只按通用 sourceKey 锁定来源。

## 7. 数据、接口与兼容

- **公共接口变化：** Knowledge/ResourceIO HTTP 增加可选 workspace selector query；缺省继续兼容 session/engine 推断。
- **数据模型与持久化：** 无。
- **兼容要求：** mobile、旧调用者与显式注入测试 client 保持缺省行为。
- **迁移要求：** 无。
- **发布或运维影响：** 无。

## 8. 非功能要求

- **NFR-001 安全与隐私：** 绝对路径不得向远端 principal 开放；selector 不绕过 mount capability 或 SourceRegistry identity。
- **NFR-002 性能与容量：** 不增加轮询；registry/cache 按 selector 隔离并复用。
- **NFR-003 可用性与可靠性：** 亮暗主题、键盘 tree 语义、长文件名截断、600px 窄屏无重叠。
- **NFR-004 可观测性与运营：** 失败继续使用现有安全错误 envelope。

## 9. 验证策略

| 接缝 | 层级 | 覆盖合同 | 现有先例或命令 | Evidence 类型 |
|---|---|---|---|---|
| Knowledge client/context | unit | AC-001/002/004 | `<Path>desktop/src/react/__tests__/services/knowledge-workspace-client.test.ts</Path>` | Vitest |
| Knowledge route + ResourceIO | integration/security | AC-001—003 | `<Path>tests/knowledge-workspace-route.test.ts</Path>` | Vitest |
| Knowledge shared workbench | component | AC-004—007/009/010 | DeskSection + PreviewPanel composition tests | Vitest |
| operation recovery identity | integration | AC-011 | coordinator recovery fixtures | Vitest |
| plugin surface assets | integration/component | AC-012 | plugin route + iframe host tests | Vitest |
| real desktop shell | E2E/visual | AC-001/006—012 | Knowledge and plugin desktop flows | Playwright/CDP screenshots |

## 10. 风险、假设与未决问题

主要风险是旧 Knowledge 文档状态与共享 Preview 状态同时存活，或旧恢复日志继续按 `sourceKey=main` 污染新工作区。切换到共享工作台时必须卸载旧主编辑链路，并以完整 workspace identity 隔离恢复状态。无高影响未决问题。
