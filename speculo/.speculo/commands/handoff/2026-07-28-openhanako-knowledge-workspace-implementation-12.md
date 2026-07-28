# OpenHanako 知识工作区实施交接 12

## 已关闭

- Tickets 01–13 已关闭，共 13/57。
- Ticket 12 主线实现提交为 `7618d296`。
- `MarkdownEditorSurface` 是共享 CM6 生命周期内核；save、attachment、open-link、content-gate 均为公开注入策略，`create-markdown-editor-extensions.ts` 提供唯一扩展组装入口。
- `PreviewEditor` 已收敛为薄适配器并保留 600ms autosave、expected-version、checkpoint 和原附件语义；Knowledge 使用显式手动保存，二者共享 undo、Markdown language/highlight 与既有 decorations。
- Knowledge Markdown 使用 fatal UTF-8 和 10 MiB hard gate，覆盖精确边界、超限、非法 UTF-8、BOM 与非法 surrogate；拒绝内容时不创建 CM6 编辑缓冲。
- surface scope 与保存闭包绑定，切换目标会取消旧 timer，旧草稿不会穿透写入新目标；销毁会清理 EditorView、监听器和未决 timer。
- 精确表面测试 8/8；相关定向 15 files、151/151；全仓 1014 files passed、1 skipped，10198 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、Renderer build 和 diff check 均通过；标准轴与规范轴复审 0 blocker、0 nonblocker。

## 下一步

1. 按 P0 拓扑实施 Ticket 14，冻结安全渲染、URL scheme、文件访问和外链打开策略。
2. Ticket 14 完成后，Tickets 01–14 即全部关闭，执行 P0/M0 Gate 审计后继续 P1 依赖图。
3. 后续 Markdown tickets 24–39 必须复用 Ticket 11 IR 与 Ticket 12 单一 CM6 surface，不得建立平行 parser、编辑器内核或私有保存路径。

## 保护边界

- 共享 surface 继续保持单一 CM6 kernel；扩展和行为通过 factory/compartment/policy 接缝演进。
- Renderer 不访问 Node 文件系统；共享 surface 不解析 native path，也不直接读写资源，普通资源访问继续走 ResourceIO/provider。
- Knowledge content decode/gate 是进入编辑缓冲的前置条件；读取前 stat/size gate 由后续 loader/resource flow 负责，不得用读完整文件后再检查代替。
- Preview 的 600ms autosave、expected-version、checkpoint、附件和 link 行为保持兼容。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change；全仓 Vitest 显式排除本地 scratch。
- 只有 Lead 操作 Git；不覆盖用户修改。
