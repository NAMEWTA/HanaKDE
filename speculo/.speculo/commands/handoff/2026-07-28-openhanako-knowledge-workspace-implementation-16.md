# OpenHanako 知识工作区实施交接 16

## 已关闭

- Tickets 01–16 已关闭，共 16/57；M1/P1 Workspace/文档阶段完成 2/8。
- Ticket 16 主线实现提交为 `212b9fd2`。
- Knowledge 树现在一比一展示 main 与全部当前来源根；只在明确展开来源/目录时，通过唯一 knowledge client 的 `ResourceIO.list({ sourceKey, relativePath })` 读取真实子项。
- 树不创建 Page/Asset 等虚拟分组，不访问 Node 文件系统，不新增 route、provider、watcher 或文件系统；普通树排除来源内部 `.trash/`。
- 目录默认稳定自然排序且优先于文件；Markdown、多重扩展名和未知后缀均显示完整原始文件名，窄布局下允许换行且不使用省略号替代身份。
- 展开、折叠与同 workspace 重挂载使用 Ticket 08 session store；折叠、workspace 切换和卸载取消在途请求，request identity 阻止 stale response 覆盖；新 workspace 从全折叠开始。
- 复用既有来源 watcher 与 ResourceEvent catch-up/live 流，120 ms 合并后只重查已加载且仍展开的分支；刷新失败保留旧投影、其他来源和脱敏重试入口。
- 五语言、主题变量、窄布局、tree/treeitem/group、`aria-level`、`aria-expanded`、状态/错误与键盘可达 disclosure/retry 已同步。
- 精确组件测试 1 file、6/6；相关定向 5 files、34/34；干净全仓 1019 files passed、1 skipped，10226 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、Renderer build 与 diff check 均通过；双轴复审无未决 blocker。
- 本 ticket 按冻结测试选择不运行 Playwright。

## M1 当前状态

- Tickets 15–16 已完成 Knowledge 壳、真实来源根、只读懒加载树、当前会话展开和 ResourceEvent 增量收敛。
- M1 仍需 Tickets 17–22；树选择、多选、键盘导航、排序模式与打开语义分别由 Tickets 47–49 承担，不能在早期树模型中形成不一致的平行状态机。

## 下一步

1. 实施已解锁的 Ticket 17：内容门禁与 Asset Viewer。
2. 随后按依赖图实施 Ticket 18：文档会话 registry。
3. 继续 Tickets 19–22，完成保存、冲突、组/tab/面包屑与 workspace 生命周期闭环。

## 保护边界

- Renderer 普通读取继续只经 KnowledgeResourceAddress 与 ResourceIO；不把 sourceKey 写入 Markdown，不向远程 DTO、日志或证据泄露根路径、正文或凭据。
- 来源 watcher 和 WebSocket 仍只有现有实现；后续树功能订阅同一事件投影，不建立第二 watcher/event bus。
- `.trash/` 保持普通 list/search/index/link resolver 不可见，只由后续 trash service 使用。
- 当前树没有提前实现 Tickets 47–49 的选择、键盘多选、排序模式或打开状态机；后续必须复用本票的真实地址、展开和刷新接缝。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
