# OpenHanako 知识工作区实施交接 15

## 已关闭

- Tickets 01–15 已关闭，共 15/57；M1/P1 Workspace/文档阶段已启动。
- Ticket 15 主线实现提交为 `9a7dda3b`。
- Knowledge 现在是 Chat 的固定同级顶层视图，进入后独占主页面并隐藏 Chat sidebar、Preview 与 Workspace Companion；Chat、Knowledge 之后才是可拖拽 Channels/plugins。
- 知识壳包含 main 首位来源区、资源树与一个可聚焦空编辑组；首次打开不恢复 tabs、附加挂载或树展开，Desk 紧凑视图行为保持不变。
- Renderer 复用唯一 `knowledgeWorkspaceClient` 与 Ticket 08 store；workspace identity 变化会取消旧请求、清理来源/树/tabs 并遮蔽响应切换前的旧来源名，同 identity 重挂载不会破坏 ready 状态。
- Knowledge 页面不触发 Chat 文件拖放 overlay、附件副作用或 Chat-only 布局；错误提示保持脱敏并提供重试。
- zh-CN、zh-TW、en、ja、ko、亮暗主题、窄布局、键盘、ARIA 与可见 focus 已交付。
- 精确自动化 2 files、6/6；相关定向 9 files、65/65；全仓 1018 files passed、1 skipped，10219 tests passed、6 skipped。
- E2E-KW-001 在 desktop-full 与 web-open 通过；E2E-KW-023 在 desktop-full 通过。desktop-full 2/2，web-open 1/1。
- typecheck、boundary、目标 ESLint、Renderer build 与 diff check 均通过；双轴复审无未决 blocker。

## M1 当前状态

- Ticket 15 已建立 Workspace 壳和会话隔离边界；后续资源树、Asset Viewer、文档 registry、保存/冲突、编辑组和生命周期只能在这些公开接缝上扩展。
- M1 仍需 Tickets 16–22；当前只记录 Ticket 15 的实际证据，不提前宣称阶段 Gate 通过。

## 下一步

1. 实施已解锁的 Ticket 16：资源树模型、分页和稳定排序。
2. 随后实施同样已解锁的 Ticket 17：内容门禁与 Asset Viewer。
3. 按依赖图继续 Tickets 18–22，完成 M1/P1 Gate 后再进入 Markdown 阶段。

## 保护边界

- Renderer 不访问 Node 文件系统；普通资源访问继续经唯一 ResourceIO/provider 与 knowledge client，不创建私有 route 或平行状态。
- workspace identity 切换必须取消旧请求并清除旧可见状态；首次打开不引入未定义恢复语义。
- Knowledge 与 Chat 的拖放、附件和布局副作用保持隔离；固定顶层 tab 不参与频道拖拽。
- 远程 DTO、日志和 release evidence 不含绝对路径、正文或凭据。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
