# OpenHanako 知识工作区实施交接 33

## 已关闭

- Tickets 01–33 已关闭，共 33/57；M2/P1/P2 Markdown 阶段完成 11/17。
- Ticket 33 主线实现提交为 `c5383a20`。
- Mermaid 与数学分别由 `knowledge-mermaid-field.ts`、`knowledge-math-field.ts` 唯一拥有；旧入口仅兼容转发，不建立第二份文档、selection 或 history。
- Mermaid 使用标准 fenced source；任一 selection range 触碰整块即保持源码，全部离开后才渲染，Source 模式始终 literal。
- Mermaid exact-source cache 上限 64；widget destroy 取消结果交付，stale task 不能覆盖新 source。
- Mermaid 固定 strict/no-HTML-label/secure config，丢弃 `bindFunctions`；SVG 与 scoped CSS 二次消毒，script/event/resource URL/global CSS/animation/foreignObject 均移除。
- Mermaid 单块错误原位隔离，可点击或 Enter/Space 回到源码，不改文档或 history。
- 数学支持行内 `$...$` 与 block `$$...$$`，排除 escaped dollar、inline code 与 fenced code；编辑中不调用 KaTeX，离开后刷新。
- KaTeX 固定 `throwOnError:true`、`strict:error`、`trust:false`；行内/块级错误可聚焦回源，恶意命令不产生 active content。
- 五语言、亮暗 token、560px 窄布局、button role、ARIA、focus-visible、pointer 与键盘回源均已交付。
- 精确测试 2 files、13/13；相关定向 12 files、152/152；最终实现提交后产品范围全仓 1045 files passed、1 skipped，10530 tests passed、6 skipped。
- typecheck、boundary、目标 ESLint、diff check 与 Renderer production build 通过。
- E2E-KW-011 尚无真实可执行公开入口；Tickets 48/49 完成资源树打开后必须补建并执行，最终发布前不得保留。

## M2 当前状态

- Ticket 34 可直接复用 Ticket 33 的“selection 触碰即回源、离开才刷新、错误不写文档”字段模式，但脚注必须使用 reference/inline footnote 方言，不能复用数学 parser。
- Ticket 35 必须复用本票的 SVG/CSS 安全经验与 Ticket 14 threat matrix，不得放宽 Mermaid 或 KaTeX 的 active-content 边界。
- Ticket 39 被 Ticket 33、35、37 阻塞；Mermaid/math 派生内容不能进入 page/embed 源码计数或写回正文。

## 下一步

1. 实施 Ticket 34：脚注定义、预览与补全。
2. 实施 Ticket 35：安全 HTML、本地 URL 与外部链接。
3. 实施 Ticket 36：当前 Markdown 文档查找替换。

## 保护边界

- Mermaid/数学只允许离线静态派生；不得调用 `bindFunctions`、启用 HTML label、执行脚本/事件、信任 KaTeX URL 或把错误写回 Markdown。
- Mermaid 公共 API 不提供底层 abort；只能取消结果交付并做 stale guard，不能宣称 worker 或计算任务已真实中止。
- 任一多选 range 触碰元素都必须显示源码；Source 模式不得安装派生 field。
- Mermaid CSS 只能保留生成 root ID scoped 的安全声明；不得恢复 global selector、at-rule、animation、active URL 或 foreignObject。
- 旧 `mermaid-field.ts` 与 `markdownBlockDecoField` 仅为兼容导出，不能恢复平行 decoration ownership。
- E2E-KW-011 只能在 Tickets 48/49 的真实资源打开入口完成后执行，不能添加私有 route/test shortcut。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
