# OpenHanako 知识工作区实施交接 35

## 已关闭

- Tickets 01–35 已关闭，共 35/57；M2/P1/P2 Markdown 阶段完成 13/17。
- Ticket 35 主线实现提交为 `ef654120`。
- 共享 Markdown IR 现在原生投影 block、inline、comment raw HTML token；Source range/raw 保真，不把派生 HTML 写回正文。
- `knowledge-safe-rendering.ts` 是 raw HTML 的单一解析与安全模型 owner；显式 tag/attribute allowlist 拒绝 style/class/id/event、active/resource-bearing element、comment、未知和不完整结构。
- Live Preview 只有 selection 完全离开 raw token 才显示安全 widget，触碰即回真实源码；Source 模式不安装 field。
- 内部 HTML link 复用同来源 address resolver 与既有激活入口；不跨来源猜测、搜索或预取。
- 外链只允许规范化绝对 `http:`/`https:`，只有 pointer click 或 Enter/Space 明确动作才调用 system open；Renderer、Electron main、mobile 与 web fallback 策略一致。
- 本地 `img`/`audio`/`video` 只允许当前页面目录下的同来源相对地址，经 Ticket 17 stat policy、ResourceIO、实际字节与版本复验后生成 owned Blob URL；无 autoplay，destroy/取消 abort 并 revoke。
- Mermaid、数学、脚注和 Wikilink 消费共享既有 renderer/resolver；没有建立第二套通用 Markdown renderer、文件系统或 IPC path surface。
- 五语言、亮暗 token、窄布局、ARIA、focus-visible、pointer 与 Enter/Space 已交付。
- Ticket 相关 11 files、85/85；最终受控全仓 1050 files、10570 tests，10564 passed、6 skipped、0 failed。
- typecheck、boundary、目标 ESLint、diff check、reference/preflight 17/17、persistence tripwire 7/7、Renderer/preload/main production builds 和 Node syntax checks 通过。
- `desktop/main.cjs` 的非持久化外链规范化触发真实 persistence source hash 差异；按 compatible 分类重钉 payload `sha256:f72894a5d99281fabac1cfaea048a09b97cdd01c21361fcc0764fbcb126e4cbb`，schema/ownership/DATA_EPOCH/persisted bytes 未改变。
- E2E-KW-011 尚无真实可执行公开打开入口；Tickets 48/49 完成后必须补建并执行，最终发布前不得保留。

## M2 当前状态

- Ticket 36 可直接在当前 Markdown editor/session 上实现查找替换；不得绕开 CM6 transaction、共享 buffer、read-only 和 undo history。
- Ticket 37 必须把 Wikilink completion 与 Ticket 34 脚注 completion 合并到同一个 autocomplete owner，导航继续消费 Ticket 23 resolver。
- Ticket 39 页面/章节嵌入可复用 Ticket 35 安全渲染、Ticket 33 Mermaid/math 与 Ticket 37 link seam；不得把 embedded 派生内容写回正文或跨来源加载。

## 下一步

1. 实施 Ticket 36：当前 Markdown 文档查找替换。
2. 实施 Ticket 37：Wikilink 补全、导航与延迟建页。
3. 实施 Ticket 38：附件与跨来源复制后引用。

## 保护边界

- Raw HTML 只接受冻结 allowlist；不得复用 generic sanitizer 的 permissive DOM 输入来绕过 source-level pairing/blocked 状态。
- `style`、`class`、`id`、event、script/style/iframe/object/embed/source、comment、未知和不完整结构必须 fail-closed。
- 外链只有绝对 `http:`/`https:` 且必须显式用户动作；不得自动打开、预取、跟随 redirect 元数据或向 system boundary 传入拒绝目标。
- 内部链接始终 source-scoped；不得跨来源 fuzzy/global search、暴露 sourceKey 或把外部协议伪装为内部目标。
- 本地媒体必须同来源、相对、页目录受限并走 stat-first ResourceIO；不得直接使用绝对路径、`file:`、远程 URL、Node fs 或自动播放。
- Blob URL 必须由 widget 拥有并在取消/destroy revoke；版本漂移、字节超限、权限/不可用和读取异常保持显式 fail-closed。
- E2E-KW-011 只能在 Tickets 48/49 的真实资源打开入口完成后执行，不能添加私有 route/test shortcut。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
