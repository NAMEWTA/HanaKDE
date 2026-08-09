---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-19
title: 交付共享 Document Extraction
status: review
planning_depth: deep
planning_depth_reason: "多格式/native converter、50 MiB 预算、remote Materialize、安全授权与临时文件清理构成跨平台公共能力。"
ready: true
risk: critical
blocked_by: [T-10]
contract_ids: [AC-018, AC-019, AC-020, AC-022, AC-023, AC-026]
owner: Worker-T-19 / Lead
expected_changes: ["<Path>lib/document-extract/**</Path>", "<Path>lib/tools/file-tool.ts</Path>", "<Path>core/engine.ts</Path>", "<Path>tests/document-extract-*.test.ts</Path>", "<Path>tests/engine-build-tools.test.ts</Path>", "<Path>tests/fixtures/document-extract/**</Path>"]
writable_paths: ["<Path>lib/document-extract/**</Path>", "<Path>lib/tools/file-tool.ts</Path>", "<Path>core/engine.ts</Path>", "<Path>tests/document-extract-*.test.ts</Path>", "<Path>tests/engine-build-tools.test.ts</Path>", "<Path>tests/fixtures/document-extract/**</Path>"]
read_only_paths: ["<Path>lib/resource-io/**</Path>", "<Path>core/agent.ts</Path>", "<Path>plugins/office/**</Path>", "<Path>core/knowledge-workspace/**</Path>", "<Path>package.json</Path>", "<Path>package-lock.json</Path>"]
shared_paths: ["<Path>core/engine.ts</Path>"]
shared_path_owners: ["<Path>core/engine.ts</Path> => T-19 narrow session File Tool injection until W3 integration; T-12 owns later production cutover work"]
---

# Ticket T-19: 交付共享 Document Extraction

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/19-deliver-shared-document-extraction.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-19.md</Path>`

## 1. 战略与来源

- **目标：** 将冻结上游 Document Extraction 提升为 HanaKDE 系统核心共享能力，经 ResourceIO bounded read/Materialize 处理已授权资源，并首先保持 File Tool 行为。
- **可观察产出：** DOCX/XLSX/PPTX/PDF/CSV/ODF/RTF/EPUB/HTML 等支持格式返回 derived Markdown/format/warnings；失败原因稳定，staging 清理，Workspace 不生成同名 Markdown。
- **来源：** `US-007`、`US-008`、`US-011`、`AC-018`—`AC-020`、`AC-022`、`AC-023`、`AC-026`、`ADR-004`、`DEC-007`、`DEC-012`。
- **当前事实：** 冻结上游包含 `<Path>lib/document-extract/</Path>`、fixtures 与 Materialize 先例；HanaKDE Office plugin 有独立 document/PDF readers 和真实产品适配。
- **Planning Depth 原因：** native/parser dependencies、跨格式输入、权限、预算和 temporary filesystem lifecycle 都有高事故半径。

## 2. 决策状态

### 已锁定决策

- Document Extraction 属于 HanaKDE 系统核心；Office plugin 不是核心 owner。
- 输入先授权并限制 50 MiB；超限在 converter 前返回 `too-large`。
- 稳定失败：`unsupported | parse-failed | scanned-pdf | too-large`；扫描 PDF 不启动 OCR。
- path-only converter 只经 ResourceIO Materialize 获得临时路径并 finally cleanup；copy/transfer/materialize 语义不合并。
- derived Markdown 只作为返回值/派生内容，不自动写入 Workspace。

### 已采用的低影响假设

- 每种格式的 warning 细节沿用上游 parser 能力；contract 只要求 detected format、derived Markdown 和结构化 warning/failure。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| extraction core/types/loaders, bounded input, Materialize adapter, File Tool integration, fixtures/failure matrix | T-10 ResourceIO/Materialize/authority、upstream parsers | Knowledge ingestion、Office差异适配、OCR、derived Markdown落盘、package gates |

## 4. 要构建什么

File Tool 或其他系统调用者提交已授权 ResourceRef。服务先检查格式和 50 MiB budget；可流式读取的资源使用 bounded bytes，path-only converter 使用 Materialize。成功返回 canonical derived Markdown、format 和 warnings；失败返回稳定 reason。临时文件无论成功、失败、取消都清理，调用结束后 Workspace 没有派生 Markdown 文件。

## 5. 实现契约

- **入口或接缝：** DocumentExtractionService/API、File Tool adapter、ResourceIO bounded read/Materialize。
- **输入与输出：** authorized ResourceRef + optional format hints → `{ markdown, format, warnings, extractorVersion }` 或 stable failure。
- **公共接口变化：** 新共享 extraction interface；不接受任意 raw path 绕过 Resource authority。
- **不变量：** budget before converter；staging always cleanup；derived output never auto-written；one overlapping parser per format responsibility。
- **状态或数据流：** authorize → inspect/budget → bounded read or materialize → detect/convert → normalize Markdown/warnings → cleanup。
- **错误与失败行为：** unsupported/too-large/scanned/parse failure 稳定；cleanup failure 可诊断但不泄漏 path；取消终止 converter并清理。
- **兼容要求：** File Tool 保持冻结上游格式行为；不保留重叠 Office parser compatibility，真实差异留 T-20 适配。
- **安全与隐私要求：** ResourceAccessPolicy、root proof、temporary restrictive permissions、no absolute path in external result。

## 6. 执行路线

1. 用冻结 fixtures 与 failure matrix 固定格式、warning、50 MiB、scanned/invalid 行为。
2. 定义系统级 extraction result/failure contract 与 extractor version。
3. 接入 bounded ResourceIO read 和 Materialize lifecycle，覆盖 authorization/cancel/finally cleanup。
4. 统一 format detection/converter output 为 derived Markdown，接入 File Tool。
5. 断言 Workspace filesystem 无派生 Markdown、OCR process 未启动、overlimit 在 converter 前拒绝。
6. 扫描重叠 parser/直接 raw path 调用，输出 T-20/T-21 消费与 packaging 清单。

## 7. 路径访问契约

- **预计修改点：** extraction core、File Tool、fixtures/tests。
- **D-T19-02（ticket；Lead 于 2026-08-10 批准）：** 仅增加 `<Path>core/engine.ts</Path>` 与 `<Path>tests/engine-build-tools.test.ts</Path>`，修复正常 Agent File Tool 无法获得 ResourceIO 的生产装配缺口。Engine 只可在 mapping `ct` 时以对象身份 `tool === toolAgent?._fileTool` 为内建 File Tool 注入当前 session sandbox `resourceIO`；不得基于名称匹配、不得调用/注入 broader engine-global ResourceIO、不得修改 `<Path>core/agent.ts</Path>`，并须有负向测试证明其他 custom、plugin、MCP 与 bridge tool context 不获得该对象。该窄共享路径在 W3 由 T-19 暂时 owner；T-12 后续 production cutover 仍为其 owner。
- **可写范围：** 仅 frontmatter `writable_paths`；Resource Kernel/Office/Knowledge/package 只读。
- **只读上下文：** Resource authority/materialize、Agent constructor、Office adapters、Knowledge consumers、dependency manifests。
- **共享路径：** `<Path>core/engine.ts</Path>` 按 D-T19-02 串行共享；T-19 是 extraction core 和此窄 session injection owner。
- **保留或不动：** Office HTML/JSON/PDF-range adapters、Knowledge index、package scripts、OCR。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | extraction fixtures | 对所有冻结支持格式运行 unit/integration fixtures | derived Markdown/format/warnings 正确，File Tool 可用 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-19.md</Path>` |
| 失败路径 | failure/security matrix | unsupported/too-large/scanned/corrupt/unauthorized/cancel/cleanup tests | 稳定 reason、effect 前拒绝、staging 清理 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-19.md</Path>` |
| 回归 | filesystem/structural | Workspace before/after assertion + parser/raw-path scan + Resource tests | 无派生文件/OCR/重叠 owner，Resource contracts 保持 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-19.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** extraction contract → resource adapter → File Tool → consumers/package；无用户数据迁移。
- **兼容窗口：** 无重叠 parser 兼容期；File Tool 外部行为直接适配共享 core。
- **监控信号：** format/failure counts、input bytes、converter duration/cancel、staging cleanup failures。
- **回滚或前向恢复：** 停止新 converter tasks并清理 staging后回退 code Wave；不恢复第二 parser owner。
- **不可逆操作与批准点：** 无持久写入；native dependency/package integration 由 T-21 并需 Git 授权。
- **收缩条件：** raw-path bypass、overlapping parser、Workspace Markdown write 和 OCR invocation 为零。

## 10. 验收标准

- [ ] `AC-018`：冻结支持格式返回 derived Markdown/format/warnings，File Tool 可消费。
- [ ] `AC-019`：四种稳定失败和 converter 前 50 MiB gate 通过。
- [ ] `AC-020`：authorized bounded read/Materialize、denial 与 staging cleanup 通过。
- [ ] `AC-022`：不写派生 Markdown、不启动 OCR、不形成 loop。
- [ ] `AC-023`/`AC-026`：Materialize 与 Transfer 分离，接口不接受 raw root/泄漏绝对路径。
- [ ] 验证记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-19.md</Path>`。
