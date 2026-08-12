# Knowledge Index Store Contract

- Promoted: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/index-store-contract.md</Path>`
- Status: Current index storage contract

## 所有权与布局

每个来源在 `<HANA_HOME>/knowledge-workspace/index/v1/<workspace-fingerprint>/<source-fingerprint>/` 拥有独立 SQLite generation、`current.json` 和 writer lock。fingerprint 基于 ProviderRootIdentity 的 SHA-256，不包含可逆绝对路径。

数据库使用仓库现有 `better-sqlite3`，启用 foreign keys、WAL、`synchronous=FULL`、5 秒 busy timeout 和 memory temp store。每来源只有一个 writer queue；route、Renderer 和 extractor 不持有数据库实例。

## 数据与查询

索引只包含已保存磁盘内容。资源、页面、链接、标签、任务和 FTS 派生表必须能由来源重建。路径保持规范原文；搜索折叠文本只做 NFC 与 locale-neutral lowercase，不承担路径 identity。

3 个以上 code point 的连续子串查询使用 FTS5 trigram 候选再以 `instr` 确认；1 至 2 code point 查询使用有预算、可分页、可取消的受限扫描。结果必须按来源分组。

## Rebuild 与收敛

全量 rebuild 写独立 build generation，完成后 checkpoint/关闭 WAL、执行 `quick_check`、重验 scope，再发布 generation 并原子替换 `current.json`。失败或取消保留旧 generation。

ResourceEvent 只是失效提示。Coordinator 按 sequence、operation id、磁盘重读和 debounce 收敛；gap 或 burst 触发 reconcile。旧查询通过 query lease 完成后才能清理旧 generation。

损坏、schema mismatch、manifest 丢失、writer lock 冲突和 rebuild 取消都必须保持来源级隔离；一个来源失败不能阻止其他来源查询。
