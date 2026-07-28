# OpenHanako 知识工作区实施交接 19

## 已关闭

- Tickets 01–19 已关闭，共 19/57；M1/P1 Workspace/文档阶段完成 5/8。
- Ticket 19 主线实现提交为 `84c66f04`。
- `KnowledgeDocumentEditor` 在读取正文前执行 stat，只有存在、为普通文件且已知大小不超过 10 MiB 的目标才进入 read；严格 UTF-8、实际字节复验、取消和 stale 结果均 fail-closed，拒绝时不创建 session/view。
- Markdown 编辑器只提供显式手动保存；`Mod-s` 仅在 manual policy 注册，没有 blur/idle/autosave，也没有 Save All。
- 同址所有 view 保存共享 registry 中的最新 buffer，并携带最近一次成功 load/save 的 provider-neutral expected version；成功推进实际保存快照的 baseline/version，保存期间产生的新编辑继续保持 dirty。
- 保存成功保持静默并保留共享 undo history；冲突/不可用/编码失败保留 buffer、baseline、dirty 和各 view 状态。
- 保存失败使用每文档唯一、可更新、持久、非模态且可关闭的 alert；后续成功只清除对应文档错误。通知组件导出供 Ticket 20 在 workspace composition 层只挂载一次。
- UTF-8 BOM 原样保持；纯 LF/CRLF 原样保持；mixed 按多数选择，平局为 LF，并在首次保存后展示规范化状态提示。
- 精确测试 1 file、10/10；共享 helper/Asset Viewer/Surface/registry 相关定向 4 files、38/38；更广相关定向 8 files、237/237。
- 最终代码提交上的干净全仓为 1023 files passed、1 skipped，10269 tests passed、6 skipped；typecheck、boundary、目标 ESLint、Renderer build 与 diff check 均通过。
- 固定点 `604017e1` 到实现提交 `84c66f04` 的规范轴和标准轴复审无未决 blocker。
- E2E-KW-005 保持未执行并已登记：真实 Markdown 打开与活动 tab 路径依赖 Ticket 20/49；不创建私有测试入口，最终发布前必须从真实产品入口回填。

## M1 当前状态

- Tickets 15–19 已完成 Knowledge 壳、真实多来源只读树、内容门禁/Asset Viewer、共享文档 session/独立 view 内核，以及单文档 Markdown 手动 expected-version 保存链。
- Ticket 20 是下一关键路径：递归编辑组、tabs、临时预览与面包屑，并把 registry、编辑器和共享通知接入真实产品入口。
- M1 仍需 Tickets 20–22；E2E-KW-004/005/006/007/008/024 的真实用户旅程必须随明确依赖完成后回填。

## 下一步

1. 实施 Ticket 20：递归编辑组、tab 生命周期、临时预览、面包屑与真实 Markdown/Asset 表面组合。
2. 实施 Ticket 21：外部变化监听、clean reload、dirty 三方冲突与 resolver。
3. 实施 Ticket 22：关闭、workspace switch、退出、orphan 与未保存文档决策流。

## 保护边界

- 每个 Renderer context 必须显式创建 registry；不得改成无 owner/window 隔离的模块全局 store。
- `KnowledgeDocumentNotices` 必须在 workspace composition 层只挂载一次；不得在每个 view 重复挂载并形成重复通知。
- 保存必须保持 manual-only、expected-version 与“保存实际快照”语义；不得加入 autosave、Save All 或失败后静默推进 baseline/version。
- CM6 EditorView、DOM、syntax tree 与文件句柄不得进入共享 Zustand registry；共享 session 只保存可序列化状态。
- Ticket 20 应使用 Ticket 18/19 已有 registry/editor，而不是新建平行 tab 文档状态机或第二份 buffer。
- Ticket 21 前不得静默覆盖 dirty 外部变化；Ticket 49 前不得提前把树单/双击语义塞入 Ticket 20；Ticket 51 前不得建立路径型 native 捷径。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
