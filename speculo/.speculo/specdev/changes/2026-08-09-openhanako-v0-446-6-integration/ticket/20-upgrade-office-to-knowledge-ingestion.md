---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-20
title: 升级 Office 到 Knowledge ingestion
status: done
planning_depth: deep
planning_depth_reason: "共享 Extraction 输出需进入 Semantic IR/source-partitioned index，并处理 source/extractor version、Office差异适配与循环风险。"
ready: true
risk: critical
blocked_by: [T-14, T-15, T-19]
contract_ids: [AC-003, AC-017, AC-021, AC-022]
owner: Worker-T-20 / Lead
expected_changes: ["<Path>plugins/office/**</Path>", "<Path>core/knowledge-workspace/**</Path>", "<Path>lib/knowledge-workspace/**</Path>", "<Path>tests/office-*.test.ts</Path>", "<Path>tests/knowledge-*.test.ts</Path>", "<Path>tests/knowledge-workspace-e2e/specs/office-knowledge.spec.ts</Path>"]
writable_paths: ["<Path>plugins/office/**</Path>", "<Path>core/knowledge-workspace/**</Path>", "<Path>lib/knowledge-workspace/**</Path>", "<Path>tests/office-*.test.ts</Path>", "<Path>tests/knowledge-*.test.ts</Path>", "<Path>tests/knowledge-workspace-e2e/specs/office-knowledge.spec.ts</Path>"]
read_only_paths: ["<Path>lib/document-extract/**</Path>", "<Path>lib/resource-io/**</Path>", "<Path>lib/file-history/**</Path>", "<Path>package.json</Path>", "<Path>package-lock.json</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-20: 升级 Office 到 Knowledge ingestion

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/20-upgrade-office-to-knowledge-ingestion.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-20.md</Path>`

## 1. 战略与来源

- **目标：** 让 Office plugin 与 Knowledge ingestion 共同消费 T-19 Document Extraction，保留真实 HTML/JSON/PDF-range 差异适配，并按 resource/extractor version 重抽取、重索引。
- **可观察产出：** main/mount 中已授权 Office 文档可进入 Knowledge Semantic IR 和 Search；修改/restore 后重新抽取并收敛；Workspace 不生成派生 Markdown，不出现 parser/watcher loop。
- **来源：** `US-001`、`US-005`—`US-007`、`AC-003`、`AC-017`、`AC-021`、`AC-022`、`ADR-004`、`ADR-005`。
- **当前事实：** `<Path>plugins/office/lib/read-document.ts</Path>` 等拥有 Office readers；Knowledge 当前主要处理 Markdown/safe text，已有 Source Registry/Semantic IR/index/search。
- **Planning Depth 原因：** 跨 parser/IR/index/cache 与真实 Office product adapters，错误会导致重复解析、搜索分叉或 watcher loop。

## 2. 决策状态

### 已锁定决策

- T-19 是 canonical extraction owner；Office plugin 只保留未被覆盖的真实产品输出适配。
- Knowledge 保存/比较 resource version 与 extractor version，任一变化触发 re-extract/re-index。
- derived Markdown 直接进入 Semantic IR/index pipeline，不写为 Workspace resource。
- History 与 Knowledge DB/policy 保持独立；restore 只通过 ResourceEvent 驱动 re-ingestion。
- scanned PDF 返回结构化失败，不启动 OCR。

### 已采用的低影响假设

- extraction cache key 的内部编码可结合现有 source generation，但必须显式含 source/resource 与 extractor version。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| Office adapters、Knowledge extraction reader、version/cache invalidation、IR/index/search、E2E、overlap parser removal | T-19 extraction、T-14 event/repair、existing Semantic IR/Source Registry | OCR、Workspace Markdown output、History DB合并、package/native Gate |

## 4. 要构建什么

Office 文档成为可索引 source 后，Knowledge reader 经 Resource authority 调用共享 Extraction，把 derived Markdown 转为现有 IR 并提交 source-partitioned generation。资源内容或 extractor version 变化会失效旧派生状态。restore、external edit、rename/delete 使用统一事件/repair 链收敛；unsupported/scanned/parse failure 可诊断且不生成文件。

## 5. 实现契约

- **入口或接缝：** Knowledge source reader/extractor adapter、Office tool adapters、source generation/index/search。
- **输入与输出：** authorized Office ResourceRef + resource/extractor version → derived Markdown IR/index document or stable extraction status。
- **公共接口变化：** Knowledge search behavior扩展到 Office内容；Office真实 HTML/JSON/PDF-range outputs 保持。
- **不变量：** one canonical parser per overlapping format；no derived file write；generation partition/atomicity；History DB independent。
- **状态或数据流：** resource event/scoped repair → version check → shared extraction → Semantic IR → generation/index → Search。
- **错误与失败行为：** extraction failure 标记 source 派生状态但不污染旧成功 generation；retry 只针对 stale source；scanned no OCR。
- **兼容要求：** 保留 Office plugin 对外真实差异；删除仅重复 canonical extraction 的 parser/code/tests。
- **安全与隐私要求：** ResourceAccessPolicy/Materialize 执行；Search/output 不泄漏原始 root/staging path。

## 6. 执行路线

1. 用 DOCX/XLSX/PPTX/PDF create/modify/restore/failure fixtures 固定 Office-Knowledge 红色合同。
2. 建立 Knowledge extraction adapter 与 resource/extractor version cache invalidation。
3. 将 derived Markdown 送入现有 Semantic IR/source generation/index/search，不写 Workspace 文件。
4. 将 Office plugin readers 改为共享 extraction + 差异 adapter，验证后删除重叠 parser/tests。
5. 覆盖 external change、restore、rename/delete、scanned/parse failure 和 scoped retry。
6. 由当前 Ticket 实现 owner 运行 Office Knowledge E2E 与 parser/watcher loop scan。

## 7. 路径访问契约

- **预计修改点：** Office plugin、Knowledge core/lib 和定向 tests/E2E。
- **可写范围：** 仅 frontmatter `writable_paths`；Extraction/Resource/History/package 只读。
- **只读上下文：** canonical extraction、event/repair、History and manifests。
- **共享路径：** 无；依赖 T-14/T-15/T-19 后修改 Knowledge/Office owned paths。
- **保留或不动：** native packaging、Workspace UI、OCR、History store。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | Office-Knowledge integration | create/modify Office fixtures → query Search/IR | canonical extraction进入分区索引，version变化重抽取 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-20.md</Path>` |
| 失败路径 | extraction/index matrix | scanned/corrupt/unauthorized/index failure/retry | stable state、不污染 generation、不 OCR/落盘 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-20.md</Path>` |
| 回归 | parser/Knowledge suite | Office adapters + Knowledge event/query tests + overlap scan | 差异适配保持，重叠 parser/loop 为零 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-20.md</Path>` |
| E2E（owner：当前 Ticket 实现 owner） | Playwright Knowledge flow | 添加报告 → Search → 修改/restore → Search | 内容按版本收敛，无派生 Markdown | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-20.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** adapter/version contract → IR/index integration → Office consumer cutover → remove duplicate parser；无用户数据 migration。
- **兼容窗口：** 无并列 parser；真实差异 adapter 是产品能力，不是 legacy compatibility。
- **监控信号：** extraction cache hits/stale、format/failure、generation commit、search freshness、loop/scan counters。
- **回滚或前向恢复：** 停止新 ingestion queue后回退 code Wave；不恢复重复 parser/watcher，index 可按现有 generation 重建。
- **不可逆操作与批准点：** parser 删除前必须有 fixture/E2E等价 Evidence；Git integration 需用户授权。
- **收缩条件：** 重叠 Office parser、derived Markdown write、OCR invocation 和 direct root watcher 为零。

## 10. 验收标准

- [ ] `AC-003`：Office/Knowledge/Workbench 既有合同无回退。
- [ ] `AC-017`：modify/restore 后 Knowledge/Search 与磁盘版本一致。
- [ ] `AC-021`：共享 Extraction 进入 IR/index/Search，resource/extractor version 可失效重建。
- [ ] `AC-022`：无派生 Markdown、OCR 或 watcher/index loop。
- [ ] E2E/parser scan Evidence 记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-20.md</Path>`。
