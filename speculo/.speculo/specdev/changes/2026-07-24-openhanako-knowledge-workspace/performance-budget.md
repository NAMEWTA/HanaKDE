# 知识工作区性能预算

## 测量契约

- 固定 fixture seed：`20260725`。
- Node：仓库 engine 的 Node 24；release evidence 记录完整版本。
- 测试使用 production build，关闭 devtools、source map 热更新和 debug logging。
- 每个场景 3 次 warm-up、10 次测量；p50/p95 使用 nearest-rank；同时记录最小、最大和峰值 RSS。
- 每次测量使用独立临时 HANA_HOME 和本地 SSD 临时目录；搜索 warm 场景先完成一次 query。
- Reference runner 最低：8 logical CPU、16 GiB RAM、SSD；实际 CPU、RAM、OS、filesystem、Node、commit 写入 `release-evidence.md`。
- CI smoke 使用 1/10 数据集，验证算法上限和相对回归；完整预算必须在 reference runner 执行。
- 相对回归门槛：与同一 runner 最近一个通过基线相比 p95 不得恶化超过 15%，RSS 不得增加超过 20%，即使仍低于绝对预算也必须解释。

## 数据集

生成器位于 `tests/fixtures/knowledge-workspace/generate-fixture.ts`，必须确定性创建：

- 4 个来源，目录深度 1—12，混合大小写、Unicode、长名称和空目录。
- 100k resources：60k Markdown、20k 安全文本、10k 图片 metadata、5k PDF metadata、5k unknown/binary。
- 50k Wikilinks、10k broken links、20k tags、20k tasks、5k headings-heavy pages。
- 5k watcher events/10s，包含 duplicate、rename、delete、sequence gap 和内部 operation correlation。
- 10 MiB 严格 UTF-8 Markdown、混合换行输入和门禁外 10 MiB+1 byte 文件。

## 预算

| 场景 | 数据集 | 预算 |
|---|---|---|
| 首层资源树 | 10k entries | 首次可交互 p95 ≤ 1.5s；主线程单任务 ≤ 50ms |
| 超大树 | 100k entries | 不一次渲染全部节点；取消响应 ≤ 100ms；峰值 RSS 基线另加 ≤ 300 MiB |
| Markdown 打开 | 10 MiB UTF-8 | 门禁内 p95 ≤ 2s；门禁外不得创建 EditorView |
| 密集链接 decoration | 50k Wikilinks | 初次可取消；增量 p95 ≤ 250ms；过期任务不提交 |
| watcher burst | 5k events/10s | UI 无 >50ms 连续阻塞；最终索引一致；无重复项 |
| 搜索 warm | 100k resources / 4 sources | p50 ≤ 150ms；p95 ≤ 500ms；取消响应 ≤ 100ms |
| 搜索 cold open | 当前 generation 首次查询 | p95 ≤ 1.2s |
| 多视图 | 100 tabs / 4 groups | 活动 EditorView 数 ≤ 可见 views + 2；切换 p95 ≤ 150ms |
| full rebuild | 100k resources | 有进度/取消；取消保留旧 generation；event-loop task ≤ 50ms |
| generation switch | 旧查询并发 | current manifest 切换 ≤ 100ms；旧查询完成无错误 |
| operation recovery | 1k journal records | 启动 scan p95 ≤ 1s；只扫描未 final records |

## 证据文件

完整运行输出 JSON 到：

```text
<HANA_HOME>/knowledge-workspace/evidence/performance/<commit>/<platform>.json
```

JSON 包含 fixture hash、commit、machine、samples、percentiles、RSS、pass/fail 和基线比较。不得只在文档中手写“通过”。
