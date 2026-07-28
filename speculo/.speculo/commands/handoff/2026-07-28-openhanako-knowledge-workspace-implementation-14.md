# OpenHanako 知识工作区实施交接 14

## 已关闭

- Tickets 01–14 已关闭，共 14/57；P0/M0 基础契约 Gate 已通过。
- Ticket 14 主线实现提交为 `8766d2a1`。
- Knowledge address 读取现在强制 stat-first、10 MiB hard limit、可用版本 identity 与 `openRead(expectedVersion)`；超限、无版本、流大小漂移、取消和 TOCTOU 均在正文暴露前 fail-closed。
- ResourceRef route 会在 provider 调用前拒绝客户端伪造的 principal/user/studio/owner/scope/native credential/token/window 字段。
- Markdown URL/image 策略默认拒绝主动资源；仅精确放行当前文档上下文解析出的本地图片 URL。Mermaid 固定 strict 配置、禁用 HTML label、丢弃绑定并对 SVG 做严格 allowlist 消毒。
- 当前 macOS runner 实际覆盖真实 symlink 越界/循环/TOCTOU、原生 case/Unicode、控制字符/盘符/UNC、伪造身份、远程错误/日志脱敏、stat-before-read、HTML/SVG/URI、图片和 Mermaid；Windows junction 分支已固化但未冒充执行。
- 精确门禁 2 files、13/13；相关定向 10 files、192/192；全仓 1016 files passed、1 skipped，10211 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、Renderer build 与 diff check 均通过；双轴复审 0 blocker。

## M0 Gate

- Tickets 01–14 全部完成；Node 24、`better-sqlite3` ABI/FTS5、Playwright 1.62.0 基础设施、Open/Full boundary、SilverBullet 钉选/许可证、来源 root identity、ResourceIO transfer、operation journal、共享 IR/CM6、性能 fixture 与 TM 测试入口均已有实际证据。
- M0 的非用户流程 tickets 使用 Vitest；本票 E2E-KW-022 仅追踪，未执行。
- 跨平台发布矩阵、20 项威胁最终闭环和 24 个 E2E 仍由后续 owner tickets 与 Ticket 57 完成，不由 M0 基线冒充发布通过。

## 下一步

1. 按依赖图进入 M1/P1，先实施已就绪的 Ticket 15（知识视图壳与空白 main 会话）。
2. Ticket 15 完成后依次解锁 Ticket 16，并为依赖 14/15 的 Ticket 17 建立内容门禁与 Asset Viewer。
3. 后续所有知识 UI 必须复用现有唯一 knowledge client、共享 CM6 surface、SourceRegistry 与 ResourceIO，不得创建私有 route 或平行状态/文件系统。

## 保护边界

- Renderer 不访问 Node 文件系统；远程 DTO、日志和 release evidence 不含绝对路径、正文或凭据。
- 原生能力继续限定为 Desktop Full/Main-only credential + 单次 grant；普通 server token 不获得原生路径权限。
- Markdown/HTML/Mermaid 与远程图片维持默认拒绝；未来 Ticket 33/35 只能在固定安全策略内扩展。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
