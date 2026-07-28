# OpenHanako 知识工作区实施交接 20

## 已关闭

- Tickets 01–20 已关闭，共 20/57；M1/P1 Workspace/文档阶段完成 6/8。
- Ticket 20 主线实现提交为 `0150b9c5`。
- `KnowledgeEditorGroups` 使用递归 horizontal/vertical split tree；每组独立维护 tab 顺序、活动 view 和唯一 preview，当前布局只在 workspace 会话内存中存在。
- 普通打开先遍历所有组并按精确 `KnowledgeResourceAddress` 复用已有 view；只有显式侧边打开、显式分屏或 tab drag 才产生/移动额外 view。
- 同址 Markdown 多 view 继续绑定 Ticket 18 的同一共享 session/history；各 view 的 group、位置与模式仍独立。
- preview 被下一次普通预览替换；双击、开始编辑、明确固定或拖动立即原地 pin。关闭/替换最后 clean view 会释放 session；dirty session 即使空组收拢仍保留。
- 空侧组在最后 view 移除后递归收拢；根布局始终至少保留一个空组，workspace 改变后从单空组开始。
- tab 显示完整原始文件名；每组活动 tab 下方显示来源名、目录层级与完整文件名。面包屑点击只发出显式树定位目标，不暴露绝对路径、不自动改变树选择。
- `KnowledgeEditorGroups` 已进入真实 `KnowledgeLayout`；每个 workspace/Renderer component context 显式创建隔离 registry，`KnowledgeDocumentNotices` 在组合层只挂载一次。
- 新 UI 已覆盖五语言、tablist/tab/tabpanel/group/breadcrumb ARIA、方向键/Home/End、drag/drop、可见 focus、主题变量及两级窄布局。
- 精确测试 2 files、8/8；相关定向 8 files、130/130；干净全仓 1025 files passed、1 skipped，10277 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、Renderer build 与 diff check 均通过；固定点 `aa262b0b` 到 `0150b9c5` 的规范轴和标准轴复审无未决 blocker。
- E2E-KW-004 保持未执行并已登记：真实 tree→tab 单击/双击/Space/Enter 入口由 Tickets 48/49 交付；不创建私有测试入口，最终发布前必须回填。

## M1 当前状态

- Tickets 15–20 已完成 Knowledge 壳、只读树、内容门禁/Asset Viewer、共享文档 session、手动保存，以及递归 groups/tabs/preview/breadcrumb 组合层。
- Ticket 21 已解锁，下一关键路径是 clean 外部变化自动重载与 dirty 三方冲突。
- M1 仍需 Tickets 21–22；E2E-KW-004/005/006/007/008/024 的真实用户旅程必须随明确依赖完成后回填。

## 下一步

1. 实施 Ticket 21：外部变化监听、clean reload、dirty baseline/local/disk 三方状态与显式 resolver。
2. 实施 Ticket 22：最后 view、workspace switch、退出、来源丢失和 orphan 文档的统一保存/放弃/取消流程。
3. 进入 M2 的 Tickets 23–39；并在 Tickets 48/49 完成真实树打开入口后回填 E2E-KW-004/005/006。

## 保护边界

- 普通打开必须继续全局复用；不得因当前活动组不同而隐式创建重复 view。
- 只有显式侧边/分屏/拖动路径可创建或移动额外 view；同址 Markdown 必须复用共享 registry session，不得复制 buffer/history。
- 每组最多一个 preview；编辑、双击、明确固定和拖动必须原地 pin，不得关闭并重建 view。
- dirty session 在 Ticket 22 的显式关闭决策前不得因 tab/group 收拢被 dispose；clean 最后 view 应释放 session。
- 面包屑不得显示绝对路径或变成第二套资源浏览器；普通活动 tab 变化不得自动驱动资源树。
- groups/tabs/layout 不得写入 localStorage 或 workspace 文件；每次新 workspace 从单空组开始。
- Ticket 21 前不得静默覆盖 dirty 外部变化；Ticket 49 前不得在本组件中私自实现树单/双击语义。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
