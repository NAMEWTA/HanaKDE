# OpenHanako 知识工作区实施交接 22

## 已关闭

- Tickets 01–22 已关闭，共 22/57；M1/P1 Workspace/文档阶段 8/8 完成。
- Ticket 22 主线实现提交为 `1e1f7cb7`。
- 新增统一 lifecycle domain 与 Renderer close guard：非最后 view 直接关闭；最后 dirty view、group、workspace、session 和显式窗口关闭逐文档复用保存、放弃、取消流程。
- 任一取消或保存失败立即停止后续关闭，已完成结果不回滚；并发关闭请求不会替换当前待决对话框，卸载会安全取消。
- workspace 与 Studio 切换在修改本地状态、持久化选择、加载目录或调用服务端之前等待 close guard；无 guard 时保留原有同步与竞态语义。
- 来源事件触发来源可用性复核。clean 文档在来源丢失时保留原地址和不可用占位；dirty 文档立即转 orphan。来源恢复只自动重载 clean 文档，orphan 永不自动重绑。
- orphan 对话框只展示当前 workspace 中 available 且具 write capability 的来源；新 Page 通过 ResourceIO `expectedVersion: null` 原子创建，目标存在或已打开时不覆盖。
- orphan 新建成功后仅重绑当前 session、全部 views、tab 和 breadcrumb；以 UTF-8、无 BOM、LF 写入，不改写旧地址引用。
- Workspace 打开继续使用单个空编辑组，不恢复 preview、pinned tab 或旧布局；Knowledge 顶层视图跨 Chat/Channels 切换保持挂载，真正 workspace 切换才运行生命周期。
- 新 UI 已覆盖五语言、ARIA、键盘、focus、亮暗主题和窄布局；保存/冲突/来源不可用错误保持持久且不丢 buffer。
- 精确测试 2 files、25/25；相关定向 6 files、61/61；产品范围全仓 1030 files passed、1 skipped，10334 tests passed、6 skipped。
- persistence inventory 与兼容性 schema fingerprint 已按仓库生成器刷新，tripwire 3 files、21/21。
- typecheck、boundary、目标 ESLint（0 errors）、Renderer build 与 diff check 均通过；固定点 `18a1ce19` 到 `1e1f7cb7` 的规范轴和标准轴本地复审无未决 blocker。
- E2E-KW-008 保持未执行并已登记：真实资源树打开用户旅程依赖 Tickets 48/49；不创建私有 route/test shortcut，最终发布前必须回填。

## M1 完成状态

- Tickets 15–22 已完成 Knowledge 壳、多来源树、内容门禁/Asset Viewer、共享文档 session、手动 expected-version 保存、groups/tabs、外部三方冲突及统一 close/switch/orphan 生命周期。
- M1 的功能与单元/集成门禁均通过；E2E-KW-004/005/006/007/008/024 仍须在真实资源树打开入口完成后执行，不把当前证据冒充用户旅程。
- 下一阶段为 M2 Markdown（Tickets 23–39），入口 Ticket 23 已解锁。

## 下一步

1. 实施 Ticket 23：建立 provider-neutral 知识地址与同源 `LinkResolver`，覆盖显式相对路径、同名消歧和跨来源拒绝。
2. 按 DAG 推进 Tickets 24–39，复用 Ticket 11 的 Markdown IR、Ticket 12 的共享 CM6 表面及 Ticket 19 的保存接缝。
3. Tickets 48/49 完成真实资源树打开交互后，回填 E2E-KW-004–008/024；Ticket 57 发布前执行全部 E2E 矩阵。

## 保护边界

- 关闭顺序必须逐文档稳定执行；取消或保存失败立即停止，不回滚已完成结果，也不得用新的并发请求替换当前决策。
- 非最后 view 不得询问保存；最后 dirty view 才进入保存、放弃、取消。clean view 可直接关闭。
- workspace/session/窗口关闭必须通过公开 lifecycle guard；不得新增 Renderer 文件系统访问、私有 IPC、私有 route 或第二套关闭协议。
- 来源丢失时 clean 只保留不可用占位，dirty 转 orphan；来源恢复不得自动重绑 orphan、猜测新地址或重建旧文件。
- orphan 只能保存到当前 workspace 的 available、writable 来源；目标必须用 `expectedVersion: null` 原子创建，冲突不得覆盖。
- orphan 保存成功只重绑当前文档身份，不执行移动、迁移或引用重构；新建文本固定 UTF-8、无 BOM、LF。
- Workspace 生命周期不持久化或恢复 preview、pinned tab、groups/layout；切换失败或取消不得部分应用新 workspace 状态。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
