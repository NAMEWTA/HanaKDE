# Tickets Map: OpenHanako 知识工作区

本地图是 57 个实施切片的唯一索引。需求 ownership 以 [`requirements-traceability.md`](./requirements-traceability.md) 与各 ticket「需求追踪」行为权威；实施范围必须同时服从 accepted `LOG.md`、`ADR.md`、`CONTEXT.md`、`spec.md` 和实施契约，不得因切片交付物或简述未逐项复写而缩减已确认结论。

## 执行规则

- 只有全部 blocker 已完成时 ticket 才可开始。
- Ticket tracking 只列该 ticket 的 Primary Story ownership 与直接规则域，不使用通配范围。
- Ticket 57 只运行并汇总证据，不拥有任何 `KW-US-*`，不修改设计 `LOG.md` 记录运行结果。
- mutation、index、native 与 E2E 不得偏离冻结实施契约。
- 每个 ticket 默认运行相关 Vitest；只有直接交付真实 Browser/Electron 用户流程、且 ticket 明确标为 Playwright 适用时，才运行对应 E2E。发布级关联 ID 不构成该 ticket 的 Playwright 门禁。
- Gate 映射以 [`goal-plan.md`](./goal-plan.md) 为权威：P0=`01–14`，P1=`15–27, 38, 40–56`，P2=`28–37, 39, 57`；三层均为 V1 必交付范围。
- ticket 在 blocker 就绪后即可实现和审查，但 issue 关闭与 Gate 宣告严格按 P0→P1→P2；后级实现等待前级 Gate 时使用 `implemented_waiting_gate`。
- 本 change 未激活带编号状态表的冻结合同模式，因此不创建空的 Contract ID 列，也不伪造 `todo/done/deviate` 回写。

## 执行清单

| 编号 | Phase | Ticket | 被阻塞于 | Primary 需求/规则 | Gate | 状态 |
|---|---|---|---|---|---|---|
| 01 | 0 基础契约 | [冻结真实仓库基线与兼容契约](./ticket/01-freeze-real-repository-baseline.md) | 无 | KW-RULE-PREFLIGHT, KW-RULE-TEST | P0 | 已完成 |
| 02 | 0 基础契约 | [建立 SilverBullet 可审计参考边界](./ticket/02-audit-silverbullet-reference.md) | 无 | KW-RULE-LICENSE | P0 | 已完成 |
| 03 | 0 基础契约 | [冻结 Open 知识协议与资源地址命名](./ticket/03-freeze-open-knowledge-contract.md) | 01 | KW-US-004, KW-US-009, KW-US-163, KW-US-164, KW-US-172, KW-US-173, KW-RULE-RESOURCE | P0 | 已完成 |
| 04 | 0 基础契约 | [建立稳定错误与诊断契约](./ticket/04-define-errors-and-diagnostics.md) | 01, 03 | KW-US-170, KW-RULE-OBS | P0 | 已完成 |
| 05 | 0 基础契约 | [适配 main 与会话级来源注册表](./ticket/05-adapt-workspace-source-registry.md) | 03, 04 | KW-US-001, KW-US-002, KW-US-007, KW-US-008, KW-RULE-RESOURCE | P0 | 已完成 |
| 06 | 0 基础契约 | [补齐 ResourceIO HTTP 变更接缝](./ticket/06-complete-resource-io-http-seams.md) | 03, 04, 05 | KW-RULE-RESOURCE | P0 | 已完成 |
| 07 | 0 基础契约 | [迁移 Server、Desk 与 Workbench 兼容入口](./ticket/07-migrate-server-desk-workbench.md) | 05, 06 | KW-RULE-RESOURCE | P0 | 已完成 |
| 08 | 0 基础契约 | [迁移 Renderer 资源客户端与 Desk 兼容状态](./ticket/08-migrate-renderer-resource-client.md) | 05, 06, 07 | KW-RULE-RESOURCE | P0 | 已完成 |
| 09 | 0 基础契约 | [迁移 Mobile 与 LAN 知识契约](./ticket/09-migrate-mobile-lan-contract.md) | 05, 06, 07 | KW-US-010, KW-RULE-RESOURCE | P0 | 已完成 |
| 10 | 0 基础契约 | [贯通知识操作计划与提交曳光弹](./ticket/10-trace-knowledge-operation-protocol.md) | 04, 06 | KW-US-143, KW-RULE-OBS, KW-RULE-OP, KW-RULE-RECOVERY | P0 | 已完成 |
| 11 | 0 基础契约 | [建立 Markdown 知识语义 IR](./ticket/11-define-markdown-semantic-ir.md) | 02, 03 | KW-RULE-MARKDOWN | P0 | 已完成 |
| 12 | 0 基础契约 | [抽取策略驱动的共享 CM6 表面](./ticket/12-extract-policy-driven-cm6-surface.md) | 01, 02, 11 | KW-US-057, KW-RULE-MARKDOWN | P0 | 已完成 |
| 13 | 0 基础契约 | [建立性能预算与基准夹具](./ticket/13-establish-performance-fixtures.md) | 01, 03 | KW-RULE-PERF, KW-RULE-TEST | P0 | 已完成 |
| 14 | 0 基础契约 | [建立威胁模型与恶意工作区门禁](./ticket/14-establish-malicious-workspace-tests.md) | 03, 04, 05 | KW-US-171, KW-RULE-SEC, KW-RULE-TEST | P0 | 已完成 |
| 15 | 1 Workspace/文档 | [交付知识视图壳与空白 main 会话](./ticket/15-deliver-knowledge-shell.md) | 05, 08 | KW-US-011, KW-US-167, KW-US-168, KW-US-169 | P1 | 已完成 |
| 16 | 1 Workspace/文档 | [交付真实多来源只读资源树](./ticket/16-deliver-readonly-source-tree.md) | 06, 08, 15 | KW-US-012, KW-US-013, KW-US-030 | P1 | 已完成 |
| 17 | 1 Workspace/文档 | [交付内容门禁与基础 Asset Viewer](./ticket/17-deliver-open-policy-and-asset-viewer.md) | 06, 14, 15 | KW-US-156, KW-US-158, KW-US-159, KW-US-160, KW-US-161, KW-US-162, KW-RULE-SEC, KW-RULE-NATIVE | P1 | 已完成 |
| 18 | 1 Workspace/文档 | [建立共享文档会话与视图状态](./ticket/18-establish-document-session-registry.md) | 08, 12, 17 | KW-US-041, KW-US-042, KW-US-043, KW-US-044, KW-US-166 | P1 | 已完成 |
| 19 | 1 Workspace/文档 | [交付单 Markdown 打开编辑保存曳光弹](./ticket/19-deliver-manual-save-tracer.md) | 06, 12, 18 | KW-US-058, KW-US-123, KW-US-124, KW-US-125, KW-US-126, KW-US-127, KW-US-128, KW-US-129, KW-US-130, KW-US-131, KW-US-132 | P1 | 已完成 |
| 20 | 1 Workspace/文档 | [交付编辑组、标签、临时预览与面包屑](./ticket/20-deliver-groups-tabs-breadcrumbs.md) | 15, 18 | KW-US-035, KW-US-036, KW-US-037, KW-US-038, KW-US-039, KW-US-040, KW-US-049, KW-US-053, KW-US-054 | P1 | 已完成 |
| 21 | 1 Workspace/文档 | [交付外部变化与显式三方冲突](./ticket/21-deliver-external-change-conflicts.md) | 04, 06, 19 | KW-US-133, KW-US-134, KW-US-135 | P1 | 已完成 |
| 22 | 1 Workspace/文档 | [交付关闭、Workspace 切换与悬空文档](./ticket/22-deliver-close-switch-orphan-flow.md) | 05, 18, 19, 20, 21 | KW-US-045, KW-US-046, KW-US-047, KW-US-048, KW-US-050, KW-US-051, KW-US-052, KW-US-136, KW-US-137, KW-US-138, KW-US-139, KW-US-140, KW-US-141, KW-US-142 | P1 | 已完成 |
| 23 | 2 Markdown | [建立知识地址与同源 LinkResolver](./ticket/23-define-knowledge-address-resolver.md) | 05, 11 | KW-US-003, KW-US-119, KW-RULE-MARKDOWN | P1 | 已完成 |
| 24 | 2 Markdown | [交付 Wikilink 与 Markdown Link 解析渲染](./ticket/24-deliver-wikilink-markdown-links.md) | 11, 12, 23 | KW-US-114, KW-US-177, KW-RULE-MARKDOWN | P1 | 已完成 |
| 25 | 2 Markdown | [交付 YAML Frontmatter 保真投影](./ticket/25-deliver-frontmatter-roundtrip.md) | 11, 12, 19 | KW-US-174, KW-RULE-MARKDOWN | P1 | 未开始 |
| 26 | 2 Markdown | [交付标签与页面内任务](./ticket/26-deliver-tags-and-page-tasks.md) | 11, 12, 19, 25 | KW-US-175, KW-US-176, KW-RULE-MARKDOWN | P1 | 未开始 |
| 27 | 2 Markdown | [交付 Live Preview 与源码模式状态](./ticket/27-deliver-live-preview-modes.md) | 12, 18, 24 | KW-US-055, KW-US-056, KW-RULE-MARKDOWN | P1 | 未开始 |
| 28 | 2 Markdown | [交付列表、引用与任务 Enter 事务](./ticket/28-deliver-enter-transactions.md) | 27 | KW-US-059, KW-US-060, KW-RULE-MARKDOWN | P2 | 未开始 |
| 29 | 2 Markdown | [交付 Tab 与 Shift+Tab 行级事务](./ticket/29-deliver-tab-transactions.md) | 27 | KW-US-061, KW-US-062, KW-US-063, KW-RULE-MARKDOWN | P2 | 未开始 |
| 30 | 2 Markdown | [交付格式快捷键与斜杠命令](./ticket/30-deliver-format-and-slash-commands.md) | 27 | KW-US-064, KW-US-065, KW-US-066, KW-US-067, KW-US-068, KW-US-069, KW-US-070, KW-US-071, KW-US-072, KW-RULE-MARKDOWN | P2 | 未开始 |
| 31 | 2 Markdown | [交付表格与代码块编辑预览](./ticket/31-deliver-tables-and-code-blocks.md) | 27 | KW-US-073, KW-US-074, KW-US-075, KW-US-076, KW-RULE-MARKDOWN | P2 | 未开始 |
| 32 | 2 Markdown | [交付软换行与编辑器状态栏](./ticket/32-deliver-wrap-and-editor-status.md) | 20, 27 | KW-US-077, KW-US-078, KW-US-079, KW-US-080, KW-US-081, KW-US-082, KW-US-083, KW-RULE-MARKDOWN | P2 | 未开始 |
| 33 | 2 Markdown | [交付 Mermaid 与数学静态渲染](./ticket/33-deliver-mermaid-and-math.md) | 14, 27, 31 | KW-US-084, KW-US-085, KW-US-086, KW-US-087, KW-RULE-MARKDOWN | P2 | 未开始 |
| 34 | 2 Markdown | [交付脚注定义、预览与补全](./ticket/34-deliver-footnotes.md) | 11, 27 | KW-US-088, KW-US-089, KW-US-090, KW-RULE-MARKDOWN | P2 | 未开始 |
| 35 | 2 Markdown | [交付安全 HTML、本地 URL 与外链策略](./ticket/35-deliver-safe-html-and-external-links.md) | 14, 17, 23, 27 | KW-US-091, KW-US-092, KW-US-093, KW-US-094, KW-US-122, KW-RULE-MARKDOWN, KW-RULE-SEC | P2 | 未开始 |
| 36 | 2 Markdown | [交付当前 Markdown 文档查找替换](./ticket/36-deliver-find-replace.md) | 20, 27 | KW-US-095, KW-US-096, KW-US-097, KW-US-098, KW-US-099, KW-US-100, KW-US-101, KW-US-102, KW-US-103, KW-US-104, KW-US-105, KW-US-106, KW-US-107, KW-US-108, KW-US-109, KW-US-110, KW-US-111, KW-US-112, KW-RULE-MARKDOWN | P2 | 未开始 |
| 37 | 2 Markdown | [交付 Wikilink 补全、导航与延迟建页](./ticket/37-deliver-wikilink-completion-navigation.md) | 20, 23, 24, 27 | KW-US-113, KW-US-121, KW-RULE-MARKDOWN | P2 | 未开始 |
| 38 | 2 Markdown | [交付附件与跨来源复制后引用](./ticket/38-deliver-attachments-cross-source-copy.md) | 10, 23, 27 | KW-US-005, KW-US-006, KW-US-115, KW-US-116, KW-US-117, KW-US-118, KW-RULE-MARKDOWN, KW-RULE-COPY | P1 | 未开始 |
| 39 | 2 Markdown | [交付同源页面与章节嵌入](./ticket/39-deliver-page-section-embeds.md) | 24, 33, 35, 37 | KW-US-120, KW-RULE-MARKDOWN | P2 | 未开始 |
| 40 | 3 索引/查询 | [建立来源分区索引 Store 与 Schema](./ticket/40-establish-index-store-schema.md) | 01, 04, 05, 10, 13, 14 | KW-US-187, KW-RULE-INDEX | P1 | 未开始 |
| 41 | 3 索引/查询 | [交付 Markdown 页面抽取管线](./ticket/41-deliver-markdown-index-extraction.md) | 11, 23, 25, 26, 40 | KW-RULE-INDEX | P1 | 未开始 |
| 42 | 3 索引/查询 | [交付非 Markdown 安全文本抽取](./ticket/42-deliver-safe-text-index-extraction.md) | 17, 40 | KW-US-157, KW-RULE-INDEX | P1 | 未开始 |
| 43 | 3 索引/查询 | [交付 watcher 增量协调与 rebuild](./ticket/43-deliver-watcher-index-rebuild.md) | 06, 10, 40, 41, 42 | KW-US-193, KW-RULE-OBS, KW-RULE-INDEX, KW-RULE-RECOVERY | P1 | 未开始 |
| 44 | 3 索引/查询 | [交付标签与引用查询 API](./ticket/44-deliver-knowledge-query-apis.md) | 23, 41, 43 | KW-RULE-QUERY | P1 | 未开始 |
| 45 | 3 索引/查询 | [交付超级搜索](./ticket/45-deliver-super-search.md) | 20, 40, 43, 44 | KW-US-188, KW-US-189, KW-US-190, KW-RULE-SEARCH | P1 | 未开始 |
| 46 | 3 索引/查询 | [交付当前大纲与引用视图](./ticket/46-deliver-current-resource-views.md) | 20, 24, 44 | KW-US-191, KW-US-192, KW-RULE-QUERY, KW-RULE-VIEW | P1 | 未开始 |
| 47 | 4 资源操作 | [建立资源树选择状态机](./ticket/47-define-resource-tree-selection-reducer.md) | 16 | KW-US-019, KW-US-020, KW-US-021, KW-US-022, KW-US-028 | P1 | 未开始 |
| 48 | 4 资源操作 | [交付资源树键盘导航与范围选择](./ticket/48-deliver-tree-keyboard-range-selection.md) | 47 | KW-US-015, KW-US-016, KW-US-017, KW-US-018 | P1 | 未开始 |
| 49 | 4 资源操作 | [交付排序、打开、临时预览与标签复用](./ticket/49-deliver-tree-sort-open-preview.md) | 20, 48 | KW-US-014, KW-US-023, KW-US-024, KW-US-025, KW-US-029, KW-US-031, KW-US-032, KW-US-033, KW-US-034 | P1 | 未开始 |
| 50 | 4 资源操作 | [交付新建 Page 与文件夹](./ticket/50-deliver-create-page-folder.md) | 06, 10, 16, 48 | KW-US-178, KW-US-179, KW-RULE-OP, KW-RULE-CREATE | P1 | 未开始 |
| 51 | 4 资源操作 | [交付外部导入与原生 Picker](./ticket/51-deliver-import-native-picker.md) | 01, 03, 04, 06, 10, 14, 48 | KW-US-165, KW-US-180, KW-US-181, KW-RULE-OP, KW-RULE-SEC, KW-RULE-IMPORT, KW-RULE-NATIVE | P1 | 未开始 |
| 52 | 4 资源操作 | [交付会话内复制、剪切与粘贴](./ticket/52-deliver-internal-clipboard.md) | 10, 14, 38, 48 | KW-US-182, KW-US-183, KW-RULE-OP, KW-RULE-CLIPBOARD | P1 | 未开始 |
| 53 | 4 资源操作 | [交付资源树与编辑器拖拽协议](./ticket/53-deliver-resource-drag-drop.md) | 38, 48, 50, 51, 52 | KW-US-184, KW-US-185, KW-RULE-OP, KW-RULE-DND | P1 | 未开始 |
| 54 | 4 资源操作 | [交付同源原子重命名与移动](./ticket/54-deliver-atomic-rename-move.md) | 10, 18, 21, 23, 43, 48 | KW-US-026, KW-US-027, KW-US-186, KW-RULE-OP, KW-RULE-SEC, KW-RULE-REFACTOR, KW-RULE-RECOVERY | P1 | 未开始 |
| 55 | 4 资源操作 | [交付删除确认与来源级回收站](./ticket/55-deliver-workspace-trash-delete.md) | 10, 18, 22, 43, 47 | KW-US-144, KW-US-145, KW-US-146, KW-US-147, KW-US-148, KW-RULE-OP, KW-RULE-SEC, KW-RULE-RECOVERY | P1 | 未开始 |
| 56 | 4 资源操作 | [交付回收站恢复、清理与系统废纸篓](./ticket/56-deliver-trash-restore-cleanup.md) | 04, 10, 14, 23, 44, 51, 55 | KW-US-149, KW-US-150, KW-US-151, KW-US-152, KW-US-153, KW-US-154, KW-US-155, KW-RULE-OP, KW-RULE-SEC, KW-RULE-NATIVE, KW-RULE-RECOVERY | P1 | 未开始 |
| 57 | 5 发布 | [执行集成、迁移与发布 Gate](./ticket/57-release-knowledge-workspace.md) | 09, 13, 14, 22, 33, 34, 35, 36, 39, 45, 46, 53, 54, 56 | KW-RULE-RELEASE, KW-RULE-TEST | P2 | 未开始 |

## 依赖关系

下列明细为完整 179 条显式依赖边；`[P0|P1|P2]` 是 Gate，01/02 是当前仅有的根节点。Gate 间不存在逆向依赖。

```text
P0 = 01–14
P1 = 15–27, 38, 40–56
P2 = 28–37, 39, 57

01 [P0] [READY] [FAN-OUT: 6] freeze-real-repository-baseline <- ROOT
02 [P0] [READY] [FAN-OUT: 2] audit-silverbullet-reference <- ROOT
03 [P0] freeze-open-knowledge-contract <- 01
04 [P0] define-errors-and-diagnostics <- 01, 03
05 [P0] adapt-workspace-source-registry <- 03, 04
06 [P0] complete-resource-io-http-seams <- 03, 04, 05
07 [P0] migrate-server-desk-workbench <- 05, 06
08 [P0] migrate-renderer-resource-client <- 05, 06, 07
09 [P0] migrate-mobile-lan-contract <- 05, 06, 07
10 [P0] trace-knowledge-operation-protocol <- 04, 06
11 [P0] define-markdown-semantic-ir <- 02, 03
12 [P0] extract-policy-driven-cm6-surface <- 01, 02, 11
13 [P0] establish-performance-fixtures <- 01, 03
14 [P0] establish-malicious-workspace-tests <- 03, 04, 05
15 [P1] deliver-knowledge-shell <- 05, 08
16 [P1] deliver-readonly-source-tree <- 06, 08, 15
17 [P1] deliver-open-policy-and-asset-viewer <- 06, 14, 15
18 [P1] establish-document-session-registry <- 08, 12, 17
19 [P1] deliver-manual-save-tracer <- 06, 12, 18
20 [P1] deliver-groups-tabs-breadcrumbs <- 15, 18
21 [P1] deliver-external-change-conflicts <- 04, 06, 19
22 [P1] deliver-close-switch-orphan-flow <- 05, 18, 19, 20, 21
23 [P1] define-knowledge-address-resolver <- 05, 11
24 [P1] deliver-wikilink-markdown-links <- 11, 12, 23
25 [P1] deliver-frontmatter-roundtrip <- 11, 12, 19
26 [P1] deliver-tags-and-page-tasks <- 11, 12, 19, 25
27 [P1] deliver-live-preview-modes <- 12, 18, 24
28 [P2] deliver-enter-transactions <- 27
29 [P2] deliver-tab-transactions <- 27
30 [P2] deliver-format-and-slash-commands <- 27
31 [P2] deliver-tables-and-code-blocks <- 27
32 [P2] deliver-wrap-and-editor-status <- 20, 27
33 [P2] deliver-mermaid-and-math <- 14, 27, 31
34 [P2] deliver-footnotes <- 11, 27
35 [P2] deliver-safe-html-and-external-links <- 14, 17, 23, 27
36 [P2] deliver-find-replace <- 20, 27
37 [P2] deliver-wikilink-completion-navigation <- 20, 23, 24, 27
38 [P1] deliver-attachments-cross-source-copy <- 10, 23, 27
39 [P2] deliver-page-section-embeds <- 24, 33, 35, 37
40 [P1] establish-index-store-schema <- 01, 04, 05, 10, 13, 14
41 [P1] deliver-markdown-index-extraction <- 11, 23, 25, 26, 40
42 [P1] deliver-safe-text-index-extraction <- 17, 40
43 [P1] deliver-watcher-index-rebuild <- 06, 10, 40, 41, 42
44 [P1] deliver-knowledge-query-apis <- 23, 41, 43
45 [P1] deliver-super-search <- 20, 40, 43, 44
46 [P1] deliver-current-resource-views <- 20, 24, 44
47 [P1] define-resource-tree-selection-reducer <- 16
48 [P1] deliver-tree-keyboard-range-selection <- 47
49 [P1] deliver-tree-sort-open-preview <- 20, 48
50 [P1] deliver-create-page-folder <- 06, 10, 16, 48
51 [P1] deliver-import-native-picker <- 01, 03, 04, 06, 10, 14, 48
52 [P1] deliver-internal-clipboard <- 10, 14, 38, 48
53 [P1] deliver-resource-drag-drop <- 38, 48, 50, 51, 52
54 [P1] deliver-atomic-rename-move <- 10, 18, 21, 23, 43, 48
55 [P1] deliver-workspace-trash-delete <- 10, 18, 22, 43, 47
56 [P1] deliver-trash-restore-cleanup <- 04, 10, 14, 23, 44, 51, 55
57 [P2] release-knowledge-workspace <- 09, 13, 14, 22, 33, 34, 35, 36, 39, 45, 46, 53, 54, 56
```

## 阶段门禁

- Phase 0 完成条件：preflight、root identity、公开 contract、operation journal、IR、Playwright skeleton、性能/安全 fixture 均存在。
- Phase 1/2 的共享 contract 变更必须先回到 Phase 0 owner。
- Phase 3 在 index-store-contract 全部测试通过后开始；41/42 完成后才能进入 43，43 后才能做 query/search。
- Phase 4 所有 mutation 都复用 Ticket 10 journal；56 必须复用 Ticket 51 native bridge。
- Phase 5 只读 ownership/evidence，不修补缺失实现。

## Primary ownership 统计

- Ticket 03: 6 条用户故事。
- Ticket 04: 1 条用户故事。
- Ticket 05: 4 条用户故事。
- Ticket 09: 1 条用户故事。
- Ticket 10: 1 条用户故事。
- Ticket 12: 1 条用户故事。
- Ticket 14: 1 条用户故事。
- Ticket 15: 4 条用户故事。
- Ticket 16: 3 条用户故事。
- Ticket 17: 6 条用户故事。
- Ticket 18: 5 条用户故事。
- Ticket 19: 11 条用户故事。
- Ticket 20: 9 条用户故事。
- Ticket 21: 3 条用户故事。
- Ticket 22: 14 条用户故事。
- Ticket 23: 2 条用户故事。
- Ticket 24: 2 条用户故事。
- Ticket 25: 1 条用户故事。
- Ticket 26: 2 条用户故事。
- Ticket 27: 2 条用户故事。
- Ticket 28: 2 条用户故事。
- Ticket 29: 3 条用户故事。
- Ticket 30: 9 条用户故事。
- Ticket 31: 4 条用户故事。
- Ticket 32: 7 条用户故事。
- Ticket 33: 4 条用户故事。
- Ticket 34: 3 条用户故事。
- Ticket 35: 5 条用户故事。
- Ticket 36: 18 条用户故事。
- Ticket 37: 2 条用户故事。
- Ticket 38: 6 条用户故事。
- Ticket 39: 1 条用户故事。
- Ticket 40: 1 条用户故事。
- Ticket 42: 1 条用户故事。
- Ticket 43: 1 条用户故事。
- Ticket 45: 3 条用户故事。
- Ticket 46: 2 条用户故事。
- Ticket 47: 5 条用户故事。
- Ticket 48: 4 条用户故事。
- Ticket 49: 9 条用户故事。
- Ticket 50: 2 条用户故事。
- Ticket 51: 3 条用户故事。
- Ticket 52: 2 条用户故事。
- Ticket 53: 2 条用户故事。
- Ticket 54: 3 条用户故事。
- Ticket 55: 5 条用户故事。
- Ticket 56: 7 条用户故事。
