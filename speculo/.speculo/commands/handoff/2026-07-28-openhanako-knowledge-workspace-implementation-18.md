# OpenHanako 知识工作区实施交接 18

## 已关闭

- Tickets 01–18 已关闭，共 18/57；M1/P1 Workspace/文档阶段完成 4/8。
- Ticket 18 主线实现提交为 `72feaeff`。
- `createKnowledgeDocumentRegistry({ ownerId, windowId })` 为每个 Renderer context 创建独立 Zustand vanilla store；没有模块全局 session singleton。
- 同一 `KnowledgeResourceAddress` 共享 buffer、baseline、diskVersion、可逆文本 edit history、dirty、conflict 和 orphan；任一 view 编辑及任一 view undo/redo 都原子更新共享 session。
- 每个 view 独立保存 group、cursor、selection、scroll、viewport、Live Preview/Source mode 与语法显隐范围；共享 edit 映射各 view 位置但不把它们同步成同一位置。
- 已存在 view 再打开恢复原状态；关闭后不缓存 view，重开从文档开头和默认 Live Preview 开始。
- 同址迟到 load 不覆盖当前 session；保存期间继续编辑时，成功保存只推进实际保存快照的 baseline/version，较新的 buffer 保持 dirty。
- Registry 只保存可 JSON 序列化的知识地址、文本、version、edit 与视图数值状态；不保存绝对路径、DOM、EditorView、文件句柄或独立富文本模型。
- 精确测试 1 file、10/10；相关定向 5 files、67/67；干净全仓 1022 files passed、1 skipped，10258 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、Renderer build 与 diff check 均通过；双轴复审无未决 blocker。
- E2E-KW-004/024 保持未执行并已登记：前者等待 Ticket 20 的真实 tabs/groups 入口，后者还等待 Tickets 19/21/51 的保存、冲突与 native grant；不创建私有测试入口。

## M1 当前状态

- Tickets 15–18 已完成 Knowledge 壳、真实多来源只读树、内容门禁/Asset Viewer，以及共享文档 session/独立 view 状态内核。
- Ticket 19 和 Ticket 20 均已解锁；关键路径下一项是 Ticket 19 的单 Markdown 打开、编辑、dirty 与手动 expected-version 保存曳光弹。
- M1 仍需 Tickets 19–22；E2E-KW-004/005/006/007/008/024 的真实用户旅程必须随明确依赖完成后回填。

## 下一步

1. 实施 Ticket 19：复用 ResourceIO 与共享 CM6 表面，stat/content-gate 后建立 session，交付手动保存、expected-version、BOM/换行保持与失败通知。
2. 实施 Ticket 20：递归编辑组、tabs、临时预览与面包屑，并把 registry 接入真实产品入口。
3. 继续 Tickets 21–22：外部变化/三方冲突及关闭、workspace switch、orphan 流。

## 保护边界

- 每个 Renderer context 必须显式创建 registry；不得把本模块改成无 owner/window 隔离的全局 store 或塞入现有全局 `useStore` singleton。
- Shared session history 是纯文本 edit history；CM6 EditorView、DOM、syntax tree 与文件句柄只属于组件生命周期，不得进入 Zustand。
- Knowledge 保存必须由 Ticket 19 的手动 ResourceIO expected-version 策略完成；不得复用 Preview 的 600ms autosave。
- Ticket 20 前不在 shell/tree 中临时创造 tabs/groups 打开语义；Ticket 21 前不静默覆盖 dirty 外部变化；Ticket 51 前不建立路径型 native 捷径。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
