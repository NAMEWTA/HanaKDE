# Knowledge Performance Baseline

- Promoted: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/performance-budget.md</Path>`
- Status: Current performance measurement contract

## 测量方法

fixture seed 固定为 `20260725`。使用仓库 Node 24 与 production build，关闭 devtools、HMR 和 debug logging。每个场景预热 3 次、测量 10 次，p50/p95 用 nearest-rank，并记录 min、max 和峰值 RSS。

完整 reference runner 至少 8 logical CPU、16 GiB RAM、SSD；CI smoke 使用 1/10 数据集。相对基线门为 p95 不恶化超过 15%，RSS 不增加超过 20%。

## 数据规模

完整 fixture 包含 4 个来源、100k resources、50k Wikilinks、10k broken links、20k tags、20k tasks、5k watcher events/10s，以及 10 MiB 边界 Markdown。

## 关键预算

- 10k 首层资源树首次可交互 p95 不超过 1.5 秒，主线程单任务不超过 50ms。
- 10 MiB Markdown 打开 p95 不超过 2 秒，门禁外不得创建 EditorView。
- 3+ code point warm search p95 不超过 500ms；1 至 2 code point 每来源首批 50 条 p95 不超过 1.2 秒。
- watcher burst 最终一致且 UI 无超过 50ms 连续阻塞。
- 100 tabs/4 groups 切换 p95 不超过 150ms，活动 EditorView 不超过可见 views 加 2。
- generation manifest 切换不超过 100ms；1k journal 启动 scan p95 不超过 1 秒。

完整结果写入 `<HANA_HOME>/knowledge-workspace/evidence/performance/<commit>/<platform>.json`，不能只在 Markdown 中手写通过。
