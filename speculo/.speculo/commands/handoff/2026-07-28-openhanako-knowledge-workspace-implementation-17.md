# OpenHanako 知识工作区实施交接 17

## 已关闭

- Tickets 01–17 已关闭，共 17/57；M1/P1 Workspace/文档阶段完成 3/8。
- Ticket 17 主线实现提交为 `185949d3`。
- Asset 打开先使用真实 KnowledgeResourceAddress stat；大小未知、超过 10 MiB、目录、HTML/SVG/Mermaid/URI 主动内容和已知不支持二进制类型都在正文读取前降级为文件信息。
- 允许内容经既有 ResourceIO stat-first/expected-version 服务读取有界 base64；Renderer 再复验实际字节数，并只严格解码 UTF-8 或带明确 BOM 的 UTF-8/16/32，不猜代码页、不使用替换字符、不显示截断正文。
- 安全文本、图片、PDF、音频与视频均为只读；PDF 不调用索引/OCR/正文命中；传统编码、超限和 unknown binary 保留完整文件名、来源、知识地址、大小与默认应用入口。
- 默认应用接缝只传知识地址；Open/Web 或尚无 native 实现时明确显示 capability unavailable，绝对路径、grant credential 与任意路径 IPC 都没有进入 Renderer。
- 复用既有来源 watcher 与 ResourceEvent signal；外部变化自动刷新并保留滚动/媒体播放位置，取消和 request identity 阻止 stale 覆盖；外部删除保留查看器并显示资源不存在。
- 五语言、主题变量、键盘/focus、ARIA、窄布局、媒体错误与手动重新加载已同步。
- 精确测试 2 files、23/23；相关定向 11 files、115/115；干净全仓 1021 files passed、1 skipped，10249 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、Client/Renderer build 与 diff check 均通过；双轴复审无未决 blocker。
- E2E-KW-006/017 保持未执行并已登记：分别等待 Ticket 20/49 的真实打开入口与 Ticket 51 native bridge，不创建私有测试 route 或提前实现后续状态机。

## M1 当前状态

- Tickets 15–17 已完成 Knowledge 壳、真实多来源只读树、内容门禁与基础 Asset Viewer。
- Ticket 18 已解锁，可建立按知识地址共享 buffer/version/history/dirty、按 view 分离 cursor/scroll/mode 的文档会话 registry。
- M1 仍需 Tickets 18–22；E2E-KW-006/017 的真实用户旅程需要在明确依赖完成后回填，最终发布前不得保持未执行。

## 下一步

1. 实施 Ticket 18：共享文档会话与独立视图状态。
2. 随后实施 Ticket 19 的单 Markdown 打开、严格 UTF-8/10 MiB 门禁、手动 expected-version 保存曳光弹。
3. 继续 Tickets 20–22，建立真实编辑组/tabs/打开入口、冲突与 workspace 生命周期；届时运行已解锁的 E2E-KW-004/005/006/007/008。

## 保护边界

- Asset Viewer 只消费 KnowledgeResourceAddress 与公开 client；Renderer 不访问 Node 文件系统，不接收绝对路径、正文日志、scope token 或 native credential。
- Ticket 51 前不得把现有 `window.platform.openFile(path)` 当作 Knowledge 默认应用捷径；必须使用冻结的 grant/Main-only credential 流。
- Ticket 49 前不得在当前树上临时实现单击/双击/Space/Enter 或全局 tab 复用状态机；真实打开入口必须建立在 Ticket 20/47/48 的状态上。
- 10 MiB、active content、确定性 BOM 解码和 stat/read 版本复验不可由索引或扩展名猜测绕过。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
