# OpenHanako 知识工作区实施交接 21

## 已关闭

- Tickets 01–21 已关闭，共 21/57；M1/P1 Workspace/文档阶段完成 7/8。
- Ticket 21 主线实现提交为 `64b3d9c4`。
- `KnowledgeConflictResolver` 在 groups 组合层只挂载一次，按打开 session 的唯一来源复用既有 ResourceIO source watch 与安全资源事件链；来源首次纳入时执行 stat-first catch-up。
- clean session 的外部正文、BOM 或换行格式变化自动更新 buffer/baseline/version/format；来源级无关事件若磁盘仍等于 baseline，不制造假冲突。
- dirty session 遇到真实磁盘偏离时原子保留 baseline/local/disk、diskVersion 与 diskFormat；继续编辑、undo/redo 只更新 local，直接 Ctrl/Cmd+S 被阻断。
- expected-version 写入明确返回冲突时会立即 stat/read 最新磁盘快照，并强制建立三方状态；无法读取第三版时保留本地 buffer/baseline 和持久错误，等待资源事件或 retry。
- resolver 同时展示三版正文和 LF/CRLF、BOM、mixed 摘要，不自动合并；merge/local/disk 三个显式动作先应用选择，再进入同一 `saveKnowledgeDocument` 手动保存执行器。
- registry-authoritative controlled-content 模式让冲突选择同步回 CodeMirror；Preview 默认的本地草稿保护未改变。
- watcher 请求按 session abort，迟到结果不能覆盖较新状态；卸载释放 source lease、timer 和 controller。外部复核失败非模态显示并可 retry。
- 新 UI 已覆盖五语言、region/textarea labels、键盘按钮、可见 focus、主题变量和两级窄布局。
- 精确测试 1 file、10/10；相关定向 12 files、202/202；产品范围全仓 1026 files passed、1 skipped，10288 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、Renderer build 与 diff check 均通过；固定点 `07200ec8` 到 `64b3d9c4` 的规范轴和标准轴本地复审无未决 blocker。
- E2E-KW-007 保持未执行并已登记：真实 tree→Markdown 单击/双击/Space/Enter 入口由 Tickets 48/49 交付；不创建私有测试入口，最终发布前必须回填。

## M1 当前状态

- Tickets 15–21 已完成 Knowledge 壳、只读树、内容门禁/Asset Viewer、共享文档 session、手动保存、groups/tabs，以及外部变化与三方冲突。
- Ticket 22 已解锁，是 M1 最后一个 ticket：需要统一最后 view、workspace switch、退出、来源丢失和 orphan 文档的逐文档保存/放弃/取消流程。
- M1 的真实 E2E-KW-004/005/006/007/008/024 仍须随明确依赖完成后回填；当前不得把 unit/integration 证据冒充用户旅程。

## 下一步

1. 实施 Ticket 22：统一 close/switch/quit 顺序与保存、放弃、取消；任一取消或保存失败立即停止整体关闭，既成结果不回滚。
2. 交付来源丢失后的 clean placeholder、dirty orphan 与“保存到当前 workspace 可写来源新 Page 路径”重绑定流程。
3. 完成 M1 后进入 M2 Tickets 23–39；在 Tickets 48/49 完成真实资源树打开入口后回填 E2E-KW-004/005/006/007。

## 保护边界

- 不得把来源级广播本身当成当前文档已变化；必须 stat/read 并比较 baseline 正文与 BOM/换行格式，磁盘未偏离时不得制造 dirty 冲突。
- dirty 外部变化不得静默 reload、overwrite 或 auto-merge；baseline/local/disk 三版在显式解决前必须保留。
- conflict 存在时直接保存必须失败；只有 merge/local/disk 显式动作可以清除当前冲突并进入同一手动 expected-version 保存路径。
- 解析失败、权限/来源不可用或 stale response 不得修改当前 buffer/baseline；不得从错误文案分支，客户端只依赖稳定错误边界。
- Knowledge 可使用 registry-authoritative content；PreviewEditor 与其他调用方默认继续保护本地草稿，不得全局关闭旧防冲突逻辑。
- 继续只使用 ResourceIO/source watch/资源事件链；不得新增 Renderer 文件系统访问、第二 watcher、私有 IPC 或 route。
- Ticket 22 前不得因来源丢失自动重绑或猜测新位置；dirty session 继续保留，统一关闭/orphan 决策由 Ticket 22 接管。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
