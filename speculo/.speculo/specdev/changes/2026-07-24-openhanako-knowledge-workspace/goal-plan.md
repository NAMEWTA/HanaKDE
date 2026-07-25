# OpenHanako 知识工作区 Goal Plan

**状态：** 已规划，尚未进入实现  
**规划日期：** 2026-07-25  
**Change：** `2026-07-24-openhanako-knowledge-workspace`  
**执行模型：** Lead + Subagent  
**Subagent 固定配置：** `gpt-5.6-sol`，`reasoning_effort=medium`

本计划把已确认的 295 条 accepted LOG、295 条 accepted ADR、CONTEXT、193 条用户故事、22 个规则域、57 个 ticket 及实施契约综合为实现阶段的唯一里程碑编排入口。它不新增产品决定，也不把 ticket 的主要交付物误当作完整范围或文件白名单。

## 模式检测摘要

| 检测项 | 结果 | 对本计划的影响 |
|---|---|---|
| 冻结编号合同 | 否 | 未发现带 `P0-NN/P1-NN/P2-NN` 与 `todo/done/deviate/n/a` 状态的外部验收表；不虚构合同状态回写 |
| 冻结实施契约 | 是 | `implementation-contracts.md`、journal/index/test 等契约是唯一可编码方案，但不等同于上述编号合同模式 |
| 参考权威 | 是 | 当前 HanaKDE 是唯一底座；`silverbullet/` 只按固定矩阵作为可审计技术参考 |
| 有意偏差 | 否 | 当前没有 `DEV-NN`；任何未来偏差必须先形成并同步正式决定，不能口头接受或静默实现 |
| Ticket 数量 | 57，复杂模式 | 使用严格 P0→P1→P2 关闭次序、最多 6 个并发 subagent、强制 §9 速查表 |
| 执行模型 | Lead + Subagent | 每票执行完整八步协议、双轴审查、worktree 隔离、仅 Lead 操作 Git |
| ADR / CONTEXT / LOG | 齐全 | 实现前必须读取并保持同一最终设计，不允许选择性忽略 accepted 结论 |

模式结论由本次用户明确要求确认：所有 implementer、standards reviewer、spec reviewer 与 fixer 均固定使用 `gpt-5.6-sol`、medium；不得被工作流中的通用默认模型覆盖。

## §1 Goal

在当前 HanaKDE/OpenHanako 工作树中交付一个与聊天同级、同时可由 Desktop、独立 Open/Full Server、LAN 与 Mobile 通过同一公开协议消费的 V1 知识工作区：它以当前活动工作根为固定 `main`，允许会话级挂载零个或多个可证明互不重叠的真实来源，以 `KnowledgeResourceAddress {sourceKey, relativePath}` 在应用内定位资源、以来源内规范相对路径持久化 Markdown 链接，并围绕真实资源树、共享 CM6 Markdown 表面、文档会话与独立视图、多组标签、手动保存与三方冲突、同源链接与重构、跨来源原样复制、来源分区索引与超级搜索、来源级回收站及安全原生能力形成完整闭环；实现必须复用现有 ResourceIO/provider/ResourceEventBus、Workbench/mount、Engine public facade、Open/Full composition、PreviewEditor/CM6、MediaViewer、`window.hana` 和 Zustand 模式，坚持成功保存的磁盘内容是唯一持久知识事实、来源/owner/scope 默认拒绝、复合 mutation 可恢复、内部派生数据不进入用户来源；具体交付为 57 个 ticket 全部完成并覆盖 193 条用户故事、22 个规则域、24 个固定 E2E、20 项威胁控制、性能预算和三平台证据，交互手感参考已确认的 Obsidian/VS Code 行为，技术实现仅按冻结矩阵审计式吸收 SilverBullet 2.9.0 能力单元；任何“API 已通但用户旅程不成立”、发布 ticket 临时补功能、只覆盖 happy path、焦点/错误/取消/空状态/i18n/A11y/窄布局不完整、复制第二套文件系统/watcher/WebSocket/编辑器/索引/顶级应用、直接搬运 SilverBullet runtime，或以搜索、同名文件、绝对路径猜测跨来源关系的实现，都视为未完成。

## §2 Authoritative Inputs

### 2.1 权威输入

| 顺序 | 文件或范围 | 角色 |
|---:|---|---|
| 1 | [`LOG.md`](./LOG.md) 中全部 `Status: accepted` 条目 | 用户已确认且当前有效的完整产品决定、场景、理由与禁止边界；普通执行结果不得写入 |
| 2 | [`ADR.md`](./ADR.md) | 295 条稳定编号的架构、安全、事实来源和已提升决定；不得删除、重排或复用编号 |
| 3 | [`CONTEXT.md`](./CONTEXT.md) | 跨文档和代码的规范词义、细粒度定义与 `_Avoid_` |
| 4 | [`spec.md`](./spec.md) | 193 条产品行为、22 个规则域、实施与测试决定及完成定义 |
| 5 | [`architecture.md`](./architecture.md)、[`rules.md`](./rules.md) 与全部实施契约 | 将上位决定投影为唯一可编码结构、算法、安全、恢复、性能和工程纪律 |
| 6 | [`requirements-traceability.md`](./requirements-traceability.md) | 193 条用户故事的唯一 Primary Owner 与精确自动化证据权威 |
| 7 | [`tickets-map.md`](./tickets-map.md) 与 [`ticket/`](./ticket/) | 57 个执行切片、依赖、验收与交付记录；不得缩减上位决定 |
| 8 | [`release-checklist.md`](./release-checklist.md) 与 [`release-evidence.md`](./release-evidence.md) | 最终验收清单与实际执行证据；未执行不得写成通过 |
| 代码事实 | 当前 HanaKDE/OpenHanako 工作树与 [`implementation-baseline.md`](./implementation-baseline.md) | 唯一开发底座；若真实接缝漂移，先重新审计并同步 change |
| 技术参考 | [`silverbullet-reference-matrix.md`](./silverbullet-reference-matrix.md) 与仓库根 `silverbullet/` | 受控技术参考，不是产品语义、运行时或可覆盖上位决定的 UX 真理 |

永久 ADR 与 CONTEXT 目录当前为空；进入实现时仍须读取 `speculo/.speculo/specdev/adr/` 和 `speculo/.speculo/specdev/context/`，为空则静默继续。

### 2.2 冲突裁决协议

1. 先以 accepted LOG 还原用户确认的完整场景、理由和禁止边界。
2. 用 ADR 检查稳定架构、安全和事实来源决定，用 CONTEXT 校准术语与 `_Avoid_`。
3. 用 Spec 检查产品行为、Requirement ID 与验收是否完整表达上述决定。
4. 用 architecture 与实施契约检查是否为同一决定提供唯一可编码方案。
5. 用追踪矩阵与 tickets 检查 ownership、依赖和证据落点，禁止执行切片缩小已确认范围。
6. 若权威文件不一致，编码前同步修正所有受影响文档；不得在代码、ticket、PR 或注释中创建永久例外。
7. 当前仓库事实可以证明路径或接缝已经漂移，但不能自行推翻产品决定；先重新审计并同步 change。
8. SilverBullet、Obsidian 或 VS Code 与 OpenHanako 已接受决定冲突时，OpenHanako 决定优先，只吸收兼容部分。

这些输入是同一最终设计的不同投影；“顺序”用于定位原始意图，不授权忽略任一冲突文件。

### 2.3 已锁定产品与架构裁定

以下 18 个决策簇引用全量 accepted LOG/ADR，不替代其细节：

1. **Workspace 与来源：** 活动工作根就是唯一 workspace 的 `main`；附加来源只在当前会话存在，互相隔离且必须可证明根 `disjoint`，`unknown` 也拒绝。（ADR-0001—0003、0284—0286、0301）
2. **资源身份与隐私：** 保留既有 `ResourceRef`；新增 `{sourceKey, relativePath}` 的知识地址；Markdown 不写 `sourceKey` 或绝对路径，远程 DTO/日志不泄露根身份、scope token、凭据或正文。（ADR-0003、0286、0298）
3. **知识事实：** 成功保存的磁盘内容是唯一持久知识事实；Renderer 未保存 buffer 只属文档会话；索引可丢弃、可重建且只读已保存内容。（ADR-0006、0288）
4. **同源知识边界：** Wikilink、Markdown 内链、嵌入、出站/反向引用、标签域和知识重构严格同源；不搜索其他来源猜目标。（ADR-0007—0008、0289）
5. **跨来源行为：** 跨来源只有普通字节复制，保持正文/字节原样，不迁移、不自动删除源、不重写副本链接；编辑器必须先复制成功再插入来源内引用。（ADR-0016—0018、0274—0279）
6. **原生架构复用：** 知识核心属于 Open composition；Full 仅注入产品差异；继续复用 ResourceIO/provider/ResourceEventBus、Workbench、Engine facade、Preview/CM6、资产和 Zustand；禁止第二套基础设施与顶级应用。（ADR-0283、0287、0291）
7. **Markdown 表面：** Preview 与 Knowledge 共用策略驱动 CM6 表面和共享文本语义 IR，但不共享 CM6 parse tree；Preview 保留 autosave，Knowledge 使用手动保存。（ADR-0290—0291）
8. **文档状态：** 同一地址的 buffer/baseline/version/history/dirty 共享，cursor/selection/scroll/mode 按 view 独立；普通打开全局复用 view，只有显式侧边打开才创建第二 view。（ADR-0012、0212—0224、0292）
9. **保存与冲突：** Knowledge 明确手动保存、无“保存全部”；expected-version 写入；clean 外部变化重读，dirty 变化保留 baseline/local/disk 并显式三方解决，禁止静默覆盖、重载或自动合并。（ADR-0011、0225—0253、0293）
10. **资源树与 UI 生命周期：** 真实资源树一比一投影来源；文件夹选择/展开分离；单击预览、双击固定及键盘多选完整；V1 不跨 workspace 恢复 tabs、布局、挂载、树选择或展开。（ADR-0034—0053、0258—0264）
11. **复合 mutation：** 使用公开 plan—commit、expected versions、地址锁、checkpoint、持久 Operation Journal、幂等与启动恢复屏障；COMMITTED 后的 session/event/index 只是可重试投影。（ADR-0004、0294—0295、0302）
12. **回收站：** 每来源根级 `.trash/`，正常树和索引排除；删除/恢复/清理为资源级原子、批次级部分完成；最终只能进入系统废纸篓，绝不永久删除 fallback。（ADR-0015、0265—0273、0296）
13. **索引与搜索：** 每来源独立 better-sqlite3 schema v1 generation、单 writer 与 manifest 原子切换；连续子串语义、短查询和 Unicode 规则不得自选替代算法。（ADR-0297、0303）
14. **Native bridge：** 只扩展现有 `window.hana` 的固定表面；资源动作使用 60 秒、owner/window/action/address/version 绑定的一次性 grant；Main-only route 还需独立 credential。（ADR-0304）
15. **安全默认拒绝：** principal/owner/scope 仅来自认证 Hono context；外部输入以 `unknown` 接收并校验；symlink/junction/UNC/Unicode/TOCTOU/超限/主动内容均需真实恶意工作区证据。（ADR-0298、0301）
16. **质量与证据 ownership：** 每个 UI ticket 同时交付五语言、键盘、ARIA、主题、窄布局、取消与错误；每条用户故事只有一个非 57 Primary Owner；57 只汇总证据。（ADR-0300、0305—0307）
17. **目录分域：** index、journal、source binding 位于 `<HANA_HOME>/knowledge-workspace/`，不属于来源；来源内唯一内部区域是 `.trash/`，只能由专用服务访问。（ADR-0308）
18. **第三方适配：** SilverBullet 只能按固定矩阵研究、独立改写或小段适配；采用代码必须同步 provenance、hash 和第三方声明；禁止整体移植其产品/runtime。（ADR-0283、0299）

## §3 Definition of Done

1. **Ticket 全绿：** 01—57 全部关闭，`tickets-map.md` 状态、每个 ticket checklist、实现交接摘要和实际交付记录一致；57 不首次实现或修补任何业务能力。
2. **accepted 决策收敛：** ADR 的 295 条稳定条目继续全部为 accepted，同号 accepted LOG、CONTEXT、Spec、architecture 和实施契约表达同一最终设计；不存在未记录偏差、私有例外或静默推翻。
3. **验证门禁全绿：** `npm run lint`、`npm run typecheck`、`npm test`、`npm run lint:boundary`、Open/Full/Renderer/preload/main/server 构建与 smoke，以及三类 Knowledge E2E 命令按适用范围实际执行并通过；`E2E-KW-001`—`024` 均有规定 project/platform 证据。
4. **架构、安全、性能与平台不回退：** 无 Renderer→Node、Open→Full、route→manager 私有越界，无第二套基础设施；`TM-001`—`020`、Node 24 production 性能预算、macOS/Windows/Linux 文件系统与原生能力矩阵具有实际证据。
5. **已锁裁定不松动：** §2.3 的 18 个决策簇及其引用的全部 accepted 决定均满足；尤其守住磁盘唯一事实、来源隔离、Open 核心、跨来源只复制、手动保存/三方冲突、journal、generation 索引、grant native、内部目录分域和 57 不补功能。
6. **端到端可追溯：** 193 条 `KW-US-*` 均有唯一非 57 Primary Owner、完成 ticket、精确测试和实际结果；22 个 `KW-RULE-*`、24 个 E2E、20 项威胁、性能原始 JSON、五语言/A11y/主题/窄布局和三平台结果均可定位；每票记录 commit SHA 与实际日志、trace 或截图。

`release-evidence.md` 中未执行、失败或 flaky 项必须按事实记录；计划中的测试路径、重试后的单次成功或手写“通过”都不构成完成证据。

## §4 Ticket DAG and Scheduling Order

### 4.1 DAG 验证

- 节点：57。
- 显式依赖边：179。
- 依赖环：0。
- 悬空 blocker：0。
- `tickets-map.md` 表格、依赖代码块和 57 个 ticket 头部 blocker：一致。
- `KW-US-001`—`193` Primary Owner：完整且唯一；Ticket 57 ownership 为 0。

### 4.2 Gate 映射

| Gate | Tickets | 数量 | 定义 |
|---|---|---:|---|
| P0 | 01–14 | 14 | 仓库基线、公开协议、来源/ResourceIO、兼容入口、journal、IR/CM6、性能与安全基础 |
| P1 | 15–27、38、40–56 | 31 | Workspace/文档核心、Markdown 核心与跨源复制、索引/查询/搜索、资源树和完整资源 mutation |
| P2 | 28–37、39、57 | 12 | Markdown 增强与边界体验、页面嵌入、最终集成与发布证据 |

P2 仍是 V1 必交付范围，不表示可选或可延期。179 条边均满足“前置 Gate 不晚于后继 Gate”，不存在 P2→P1 或 P1→P0 倒挂。

```text
ROOT
├→ 01 [P0 READY, FAN-OUT: 6]
└→ 02 [P0 READY, FAN-OUT: 2]

01/02
  → 03/04/11/13
  → 05/12
  → 06/14
  → 07/10
  → 08/09
--- P0 gate: 01–14 全部关闭 ---

08/09/10/11/12/14
  → Workspace/Document: 15–22
  → Markdown core: 23–27, 38
  → Index/Query: 40–46
  → Resource operations: 47–56
--- P1 gate: 31 个核心闭环 ticket 全部关闭 ---

27
  → Markdown enhancements: 28–37
24/33/35/37
  → 39
P0/P1/P2 全部能力
  → 57 [RELEASE, 14 direct blockers]
--- P2 gate: 12 个增强/发布 ticket 全部关闭 ---
```

最长关键路径包含 18 个 ticket：

```text
01 → 03 → 04 → 05 → 06 → 07 → 08 → 15 → 17 → 18
   → 19 → 25 → 26 → 41 → 43 → 44 → 45 → 57
```

依赖就绪的后级 ticket 可以提前实现和审查，但 issue 关闭与 Gate 宣告严格遵循 P0→P1→P2；等待 Gate 的 ticket 标记为 `implemented_waiting_gate`。

### 4.3 拓扑层级

同层只表示 blocker 已就绪，不证明文件可并行写入：

```text
L00  01 02
L01  03
L02  04 11 13
L03  05 12
L04  06 14 23
L05  07 10 24
L06  08 09 40
L07  15
L08  16 17
L09  18 42 47
L10  19 20 27 48
L11  21 25 28 29 30 31 32 34 35 36 37 38 49 50 51
L12  22 26 33 52
L13  39 41 53
L14  43
L15  44 54 55
L16  45 46 56
L17  57
```

### 4.4 建议调度波次

| 波次 | Tickets | 目的与边界 |
|---:|---|---|
| 0 | 01, 02 | 真实仓库基线与 SilverBullet provenance 并行 |
| 1 | 03 | 冻结共享 Open 知识契约 |
| 2 | 04, 11, 13 | diagnostics、Markdown IR、性能 fixture 三岛并行 |
| 3 | 05, 12 | 来源注册与 CM6 表面，Server/Core 与 Renderer 分离 |
| 4 | 06, 14 | ResourceIO transfer 与恶意工作区门禁 |
| 5 | 07, 10 | 兼容 facade 与 operation journal |
| 6 | 08, 09 | Renderer client 与 Mobile/LAN，P0 收敛 |
| 7 | 15, 23, 40 | Knowledge 壳、LinkResolver、index store 三条主干 |
| 8 | 16, 17, 24 | 资源树、Asset Viewer、链接渲染 |
| 9 | 18, 42, 47 | 文档 session、安全文本抽取、tree selection reducer |
| 10 | 19, 48 | 手动保存曳光弹、树键盘与范围 |
| 11 | 20, 27, 50 | 编辑组、Live Preview、新建资源 |
| 12 | 25, 38, 49, 51 | Frontmatter、附件复制、树打开、原生导入 |
| 13 | 21, 26, 52 | 三方冲突、标签/任务、内部剪贴板 |
| 14 | 22, 41, 53 | 生命周期、Markdown 索引、拖拽 |
| 15 | 43, 28, 29, 30 | index convergence 与三个隔离 CM6 command |
| 16 | 44, 54, 31, 34 | query API、原子重构、表格/代码、脚注 |
| 17 | 45, 55, 32, 37 | 超级搜索、删除/回收站、状态栏、Wikilink 导航 |
| 18 | 46, 56, 33, 35 | 当前资源视图、恢复清理、Mermaid/math、安全 HTML |
| 19 | 36, 39 | 查找替换与页面嵌入，P1/P2 功能收敛 |
| 20 | 57 | 独占发布 Gate，只读汇总证据 |

### 4.5 并发规则

1. 全局最多 6 个活跃 subagent；implementer、reviewer 与 fixer 均占用并发槽位。
2. 每个并发 implementer 使用独立 worktree 和唯一分支 `speculo/specdev/2026-07-24-openhanako-knowledge-workspace-<nn>`。
3. 两个活跃 implementer 的 file allowlist 必须无交集；共享文件只由 Lead 修改。
4. ticket 的“交付物”和“实施时需阅读”均不是 allowlist。Lead 必须依据真实接缝、预期 diff 和测试路径生成明确且完整的 allowlist。
5. 无法证明 allowlist 互斥时，同一写入岛并发上限为 1。
6. `package.json`、`package-lock.json`、共享 contract/errors、composition、主 route、extension registry、主 UI composition、change 文档与状态文件默认 Lead-only。
7. reviewer 只读；fixer 只能写原 implementer allowlist，扩展范围必须退回 Lead 重批。
8. 所有 blocker 必须已经合并且在目标 worktree 通过基线门禁，才可派发后继 ticket。
9. ticket 关闭提交在 `hanakde` 合并并通过合并后门禁后，Lead 自动删除该 ticket 的隔离 worktree 与临时分支；此项已获用户常驻授权，无需逐次确认。

## §5 Per-Ticket Execution Protocol

以下八步对 01—57 逐 ticket 执行，不得把一个波次合并成“大 ticket”。

### 5.1 读取与设计检查

实现者必须按顺序读取：

| # | 输入 | 用途 |
|---:|---|---|
| 1 | `speculo/workflows/specdev/I-implement/I-implement.md` | 设计检查、TDD、双轴审查与提交的实现入口 |
| 2 | 当前 ticket 全文 | 验收、范围、blocker、主要交付物与保留边界 |
| 3 | 本 `goal-plan.md` | Gate、DAG、DoD、执行与治理约束 |
| 4 | `ADR.md`、`CONTEXT.md`、accepted `LOG.md` | 架构决定、词义、完整已确认场景和禁止边界 |
| 5 | `spec.md`、`architecture.md`、`rules.md` | 产品行为、唯一代码投影与工程纪律 |
| 6 | ticket 的固定实施契约与 `requirements-traceability.md` 对应行 | 算法、恢复、安全、owner 与证据 |
| 7 | ticket“实施时需阅读”的真实代码接缝 | 当前实现基座与预期 diff |
| 8 | SilverBullet 矩阵对应行和允许文件（如适用） | 受控参考与 provenance |

随后按 I-implement 完成模块、接口、不变量、错误模式、接缝、适配器和依赖类别检查；实现者向 Lead 报告预期 diff、精确测试与共享文件需求，Lead 再冻结 allowlist。

### 5.2 派单

Lead 在 blocker 已合并、worktree 基线通过且 allowlist 互斥后派单：

```text
IMPLEMENTER_DISPATCH <nn>
  issue=<issue-url-or-repo-relative-ticket>
  milestone=<M0|M1|M2|M3|M4|M5>
  gate=<P0|P1|P2>
  model=gpt-5.6-sol
  reasoning_effort=medium
  blockers=<none|nn,...>
  requirement_ids=<KW-US-*|KW-RULE-*>
  allowlist=<explicit exhaustive paths/globs>
  authority_refs=<ADR/LOG/spec/contract/matrix paths>
  verify=<ticket exact tests + required shared gates>
```

派单上下文同时包含 ADR、CONTEXT、goal-plan、ticket、固定实施契约、I-implement 和适用参考矩阵行。模型或 effort 不符时本轮结果无效，必须重新派发，不得静默降级。

### 5.3 TDD 实现

implementer 使用 `gpt-5.6-sol`、medium，在 allowlist 内：

1. 从公共接口写失败测试并保存红灯证据。
2. 只写足以通过该垂直切片的实现。
3. 补齐取消、冲突、权限/不可用、外部变化、清理与故障注入。
4. 运行 ticket 指定的精确测试。
5. 不操作 Git、不改 Lead-only 文件、不扩大范围；发现上位文档冲突时停止并回报。

### 5.4 双轴审查与修复

实现完成后并行启动两个只读 reviewer，均固定 `gpt-5.6-sol`、medium：

```text
reviewer-standards-<nn>
  检查：代码质量、模块深度、依赖/架构边界、安全、测试真实性、
        cleanup、性能和 allowlist 越界

reviewer-spec-<nn>
  检查：ticket 验收、KW-US/KW-RULE、spec/ADR/CONTEXT/实施契约、
        E2E owner、禁止范围、来源边界和事实源语义
```

任一返回 `REQUEST_CHANGES`，Lead 启动 `fixer-<nn>-<round>`，同样使用 `gpt-5.6-sol`、medium。fixer 只处理列明问题并补回归测试；修复后两个 reviewer 都必须重新审查，直到同时 `APPROVED`。reviewer 不得自行改代码。

### 5.5 Ticket 门禁

每票至少执行并记录：

```text
<ticket 指定的精确测试>
npm run typecheck
npm run lint:boundary
```

按改动范围追加：

```text
npm run lint
npm test
npm run build:packages
npm run build:renderer
npm run build:preload
npm run build:main
npm run build:server
npm run build:server:open
npm run smoke:server:open
```

涉及 composition 必须运行 Open build/smoke；涉及 Renderer/preload/main 必须运行相应 build；涉及本机路径、symlink、trash、大小写或换行必须提供 Windows/macOS/Linux 对应证据。I-implement 的通用示例不得替代本 change 的项目命令和 ticket 精确矩阵。

### 5.6 Lead 回写、handoff 与合并

1. Lead 审查 diff、allowlist 和双轴结论，只由 Lead 执行提交、合并与推送。
2. 在合并结果上重跑适用门禁。
3. 调用 handoff 流程压缩实现上下文，并在 ticket 末尾回写 `## 实现交接摘要`：commit、测试、关键决策、偏差、产物引用与交接文档。
4. 更新 ticket 状态、实际命令、平台、证据和 requirement/release evidence；普通执行结果不得写入设计 `LOG.md`。
5. 若实现要求改变 accepted 意图，先同步 LOG/ADR/CONTEXT/spec/契约和受影响 ticket，再继续；当前无编号合同或 DEV 表，不得伪造状态回写。
6. 合并冲突由 Lead 按冲突解决协议回溯双方 ticket 意图、逐块保留并重跑检查；subagent 不提交冲突解决。

### 5.7 关闭 Ticket

仅当以下条件全部满足时关闭：

- 两轴 reviewer 均批准。
- 精确测试、typecheck、boundary 与适用 build 全绿。
- commit SHA、实际输出、平台证据和 handoff 已回写。
- Primary ownership 与对应 evidence 完整。
- 所属 Gate 已开放；否则标记 `implemented_waiting_gate`。

### 5.8 Lead 纪律与收尾

- Lead 不写 ticket 实现代码；若发生，输出 `DELEGATION_VIOLATION` 并重新派单。
- implementer、reviewer、fixer 不操作 Git。
- 每个并发 ticket 使用隔离 worktree；合并后由 Lead 验证并自动清理对应 worktree 与临时分支、更新状态，不再逐次请求用户确认。
- 全部 57 票关闭后执行知识治理收尾，核对 Code、Runtime、Docs、Rules、Memory、Workspace 六个事实面。
- `silverbullet/` 是用户提供的临时参考源码，任何 agent 不得自动删除；开发完成后由用户自行删除。
- 上述自动清理授权仅覆盖本 change 已完成 ticket 的隔离 worktree 与临时分支；清理其他临时计划、调试脚本、旧副本或不属于本 change 的孤立 worktree 前，仍须先列出目标并取得用户确认。

## §6 Milestone-Level Acceptance

### 6.1 Milestone 映射

| Milestone | Gate | Tickets | 验收主题 |
|---|---|---:|---|
| M0 基础契约 | P0 | 01–14 | preflight、Open contract、来源身份、ResourceIO、journal、IR/CM6、性能与安全夹具 |
| M1 Workspace/文档 | P1 | 15–22 | 知识壳、真实树、资产、文档会话、手动保存、冲突、关闭与切换 |
| M2 Markdown | P1/P2 | 23–39 | P1 核心链接/属性/Live Preview/附件；P2 编辑增强、渲染、查找与嵌入 |
| M3 索引/查询 | P1 | 40–46 | 分区索引、抽取、watch/rebuild、查询、搜索与当前资源视图 |
| M4 资源操作 | P1 | 47–56 | 选择、键盘、新建、导入、剪贴、拖拽、重构、删除与恢复 |
| M5 发布 | P2 | 57 | 24 E2E、三 project、三平台、五语言、A11y、性能、安全与发布证据 |

### 6.2 各 Milestone 关闭条件

- **M0：** 01–14 全部通过；Node 24、`better-sqlite3` ABI/FTS5、Playwright 1.62.0、Open/Full boundary、来源 root identity、ResourceIO transfer、operation journal、共享 IR/CM6、性能和 TM 测试入口均有实际证据；SilverBullet 钉选与许可证审计无漂移。
- **M1：** 15–22 全部通过；用户能从空白 main 进入知识壳、浏览真实多来源树、安全打开资源；多视图共享文档而独立视图状态；手动保存、外部变化、三方冲突、关闭/切换/orphan 无数据丢失；相关五语言/A11y/主题/窄布局通过。
- **M2：** 23–39 全部通过；链接、Frontmatter、tags/tasks、Live Preview、编辑事务、表格/代码、Mermaid/math/footnote、安全 HTML、查找替换、附件和嵌入均服从同源、保真、安全与单一 CM6 transaction 语义。
- **M3：** 40–46 全部通过；每来源 generation 独立、原子切换、锁/租约/rebuild 取消与旧 generation 可用；saved disk 与当前 buffer 的查询事实边界正确；watcher 乱序/缺口最终收敛；性能达标。
- **M4：** 47–56 全部通过；选择与键盘语义稳定；所有 create/import/copy/cut/paste/drag-drop/refactor/trash 操作复用 plan—commit 和 journal；批次部分完成、单资源原子、重启恢复、系统废纸篓边界均成立。
- **M5：** 57 只汇总证据；193 个 owner 已完成；24 E2E、三 project、三平台、20 TM、五语言、A11y、主题、性能与迁移均在 `release-evidence.md` 有真实结果，未执行项不伪装为通过。

### 6.3 全里程碑验收仪式

1. **ADR/文档终审：** 核对 accepted LOG、ADR、CONTEXT、Spec、实施契约、requirements ownership、ticket handoff 与代码事实，无未解释冲突或静默偏差。
2. **整体验证门禁：** 在 Node 24 和隔离环境运行完整 lint/typecheck/test/build/smoke、Playwright 三 project、性能、安全与平台矩阵，只记录实际结果。
3. **集成回归走查：** 按用户使用顺序执行下述主路径与故障路径，不按 ticket 编号演示。
4. **关闭里程碑/spec issue：** 57 个 ticket 均有 commit、证据与 handoff 后再关闭关联里程碑。
5. **人工 side-by-side：** 对照 OpenHanako 冻结交互与 SilverBullet 矩阵允许点进行真机手感核对；自动化不替代最终手感环节。

### 6.4 集成回归用户旅程

#### 主路径

1. 在 Desktop Full 选择真实目录进入“知识” → 显示空白 `main`、折叠树和单空编辑组，不恢复旧状态。
2. 挂载第二个不重叠目录 → 独立来源出现；same/ancestor/descendant/unknown 根被拒绝，UI/DTO 不泄露绝对路径。
3. 用鼠标和键盘展开、范围/非连续选择、Space 预览、Enter 固定、面包屑定位 → 选择、焦点和标签复用稳定。
4. 打开 Markdown 并显式侧边打开同页 → 两视图共享源码/dirty/undo，光标、滚动和模式独立。
5. 编辑 Frontmatter、列表/任务、表格/代码、Mermaid/math/footnote 并查找替换 → 单步撤销、源码保真、主动内容不执行。
6. 导航同源 Wikilink、创建断裂目标、插入页面/章节 embed → 不跨来源、不猜目标、循环与错误明确降级。
7. 从另一来源插入 Page/Asset → 先复制完整文件，再插入当前来源内引用；失败不改正文。
8. 手动保存 → expected-version 成功、换行/BOM 契约保持、无 autosave；保存后索引收敛。
9. 使用搜索、标签、outline/outbound/backlinks → 结果按来源；buffer 与 saved generation 的事实边界正确。
10. 新建、导入、复制/剪切/粘贴和拖拽 → plan 后 commit，冲突确定、批次结果逐项可解释。
11. 同源重命名/移动 → 文件与已保存同源链接原子更新，session/event/index 在 commit 后收敛。
12. 删除、恢复并清理 → dirty 文档先处理，恢复原位置，最终只进入系统废纸篓，无永久删除 fallback。
13. 关闭最后视图或切换 workspace → 逐文档保存/放弃/取消；新 workspace 再次为空白。

#### 备选与故障路径

1. 外部工具修改磁盘 → clean 自动重载；dirty 进入 baseline/local/disk 三方冲突。
2. copy/import/move 中取消、权限失败或进程崩溃 → 无半目录，journal 重启恢复，失败项可单独重试。
3. 来源断开 → clean 显示不可用占位；dirty 成为 orphan 且不自动重绑。
4. 恶意 symlink/junction、主动内容、TOCTOU、超限或伪造身份 → fail-closed，无路径、正文或凭据泄露。
5. Open/LAN/Mobile 请求原生能力 → 明确 unavailable；普通 token、过期/重放/错窗口 grant 均拒绝。
6. 索引损坏或 rebuild 取消 → 旧 generation 可用或明确 degraded；原子修复不影响磁盘事实。

### 6.5 人工 Side-by-Side 清单

#### P0

- [ ] 对照 SilverBullet `editor_state.ts`，只核对 extension/compartment 分层与生命周期；OpenHanako 仍使用既有 CM6/PreviewEditor 策略面。
- [ ] 对照 `markdown_parser/`、`spaces/`、`plugs/index/`，只核对 parser/editor/index 分离、受控空间责任和 extractor/index/query 分层，不引入对应 runtime。
- [ ] 核对 Open/Full DTO、错误码、来源身份、远程隐私和 boundary lint；Full 只注入产品差异。

#### P1

- [ ] 对照 `wiki_link.ts`、`frontmatter.ts`、`footnote.ts`、`markdown_enter.ts`、`editor_paste.ts` 的矩阵允许点；语义必须服从 OpenHanako LinkResolver、保真、transaction 和文件协议。
- [ ] 对照 accepted LOG/Spec 中已确认的 Obsidian/VS Code 手感，核对树、tabs、preview、分组、快捷键、focus 与空状态。
- [ ] 索引、资源 mutation、回收站和 native grant 均按 OpenHanako 自有协议验收，不采用 SilverBullet Space identity 或 query/object database。

#### P2

- [ ] Markdown 增强与嵌入在亮暗主题、五语言、键盘-only、窄组和错误状态下保持完整。
- [ ] 三 project、三平台、screen-reader、性能和安全真机证据完整。
- [ ] SilverBullet 排除项没有进入 bundle、协议、持久化或产品 UI。

自动化不替代最终手感环节。

## §7 Hard Constraints

以下均为非协商约束：

1. **文档一致性：** accepted LOG、ADR、CONTEXT、Spec 与实施契约必须一致；冲突未同步前停止 ticket，否则返工。
2. **规格冻结：** 193 个用户故事与 22 个规则域是产品权威；超范围行为先更新上位文档，否则不得合入。
3. **领域不变量：** 磁盘唯一事实、来源隔离、同源引用/重构和 Open composition 先于实现便利；违反即返工。
4. **禁止平行系统：** 不得创建第二套文件系统、watcher、WebSocket、编辑器内核、索引、mutation route、server 或顶级应用；违反即删除平行实现。
5. **IO 分界：** 普通资源访问经 ResourceIO/provider，复合 mutation 经公开 coordinator 与 journal；违反即数据安全阻断。
6. **来源 fail-closed：** 根关系不能证明 `disjoint` 或 scope/identity 不稳定时拒绝来源；违反即安全阻断。
7. **Renderer 与隐私：** Renderer 不访问 Node 文件系统；DTO、日志、证据不含绝对路径、正文、scope token 或 native credential；泄露即发布阻断。
8. **认证身份：** principal/owner/scope 只来自认证 context，外部 body 身份字段必须拒绝；违反即安全阻断。
9. **手动保存：** Knowledge Markdown 不 autosave，未保存 buffer 不进入 Server index；违反即产品与数据一致性阻断。
10. **同源引用：** Wikilink、embed、backlink、标签关系和重构严格同源；跨来源先复制再引用；违反即缺陷。
11. **共享解析：** 地址、链接、转义与外链分类复用共享 IR/LinkResolver，Renderer 不得另建一套；违反即返工。
12. **提交边界：** 主资源与已保存链接构成同源 refactor 持久边界；post-commit 投影失败不得回滚磁盘事实；违反即恢复阻断。
13. **批次原子性：** 批次可部分完成，但每个顶层资源或目录必须原子，正式目标不得出现半棵树；违反即数据损坏阻断。
14. **删除安全：** 删除先入来源 `.trash`，cleanup 只进系统废纸篓，不得永久删除兜底；违反即发布阻断。
15. **索引冻结：** 使用既定 better-sqlite3 schema/generation/manifest/lock/rebuild/连续子串算法，不自选引擎或迁移；违反即返工。
16. **内容安全：** open/embed/index 先 stat 再读并执行 10 MiB 门禁；HTML/SVG/Mermaid/URI 主动内容 fail-closed；违反即安全阻断。
17. **测试隔离：** 测试使用临时 HANA_HOME/workspace/source/port，不读真实 home、不依赖固定路径或网络；违反则证据无效。
18. **精确 ownership：** 每个 KW-US 只有一个非 57 Primary Owner；57 不兜底、不首次实现业务；违反则 57 不得关闭。
19. **横切 UI：** 每个 UI ticket 同时交付 zh-CN、zh-TW、en、ja、ko、键盘、ARIA/focus、亮暗主题、窄布局、取消与错误；遗漏即未完成。
20. **伪完成禁止：** API 可用但真实 workspace、交互、边界、失败或空状态不符合规格，仍视为未完成。
21. **第三方边界：** SilverBullet 只在矩阵范围内研究、独立改写或小段适配；采用代码同步矩阵与第三方声明；违反即许可证/架构阻断。
22. **参考差异可追溯：** 与批准参考点的差异必须由 accepted 权威明确支持；当前无 DEV 表，口头偏差视为缺陷。
23. **模型固定：** implementer、两类 reviewer 和 fixer 统一 `gpt-5.6-sol`、medium；参数不符则该轮产出无效并重派。
24. **Git 与 Lead：** 仅 Lead 操作 Git，Lead 不实现 ticket 代码；违反时输出 `DELEGATION_VIOLATION` 并重派。
25. **Worktree 与 allowlist：** 并发 ticket 使用隔离 worktree、allowlist 两两不重叠、共享文件 Lead-only；违反则暂停并发。
26. **双轴审查：** standards 与 spec 两轴及适用门禁全部通过才可关闭；未清零的 `REQUEST_CHANGES` 阻断关闭。
27. **证据真实性：** 只记录实际命令、平台和结果；首次失败与 flaky 保留，NOT_RUN 不得写 PASS。
28. **LOG 语义：** 普通运行结果只写 release evidence；只有新产品决定或 trust boundary 才同步设计文档。
29. **工作树保护：** preflight 只读记录 dirty 状态，禁止 clean/reset/checkout/覆盖用户修改；违反即停止实施。
30. **代码风格与沟通：** issue、handoff、commit 和进度报告使用简体中文；代码标识与注释遵循周边仓库惯例，第三方原文和稳定标识保持原样。
31. **无未决方案：** 交付不得保留“可能/按需/A 或 B”、未选框架、未选 schema 或未定义恢复语义；存在即未完成。
32. **临时参考保护：** agent 不得删除、移动或清理仓库根 `silverbullet/`；开发完成后由用户自行删除。

## §8 Progress Reporting Format

### 8.1 派单

```text
IMPLEMENTER_DISPATCH <nn> milestone=<M0|M1|M2|M3|M4|M5> gate=<P0|P1|P2> slice=<...> model=gpt-5.6-sol effort=medium blockers=<none|nn,...> requirements=<KW-US/KW-RULE> allowlist=<paths> authority_refs=<paths>
```

### 8.2 Ticket 完成

```text
TICKET_DONE <nn> (<k>/57) milestone=<M0|...|M5> gate=<P0|P1|P2> slice=<...> model=gpt-5.6-sol effort=medium requirements=<...> authority_refs=<...> verify="<cmd>:PASS" e2e=<id:PASS|none> review=standards:PASS,spec:PASS evidence=<path-or-url> commit=<sha>
```

示例：

```text
TICKET_DONE 24 (24/57) milestone=M2 gate=P1 slice=MARKDOWN model=gpt-5.6-sol effort=medium requirements=KW-US-114,KW-US-177,KW-RULE-MARKDOWN authority_refs=ADR.md,implementation-contracts.md#7 verify="npm run typecheck:PASS" e2e=E2E-KW-009:PASS review=standards:PASS,spec:PASS evidence=<issue-url> commit=<sha>
```

### 8.3 阻塞、等待 Gate 与参考差异

```text
TICKET_BLOCKED <nn> blocker=<ticket|baseline|security|decision> evidence=<path-or-log> owner=<lead|user|ticket-nn> next=<具体解除动作>
TICKET_IMPLEMENTED_WAITING_GATE <nn> gate=<P0|P1|P2> commit=<sha> waiting_for=<gate-or-ticket>
REFERENCE_DEVIATION <nn> reference=<matrix-row> behavior=<差异> authority=<spec|LOG|ADR> disposition=<fix|record-before-continue>
```

当前没有 DEV 表；确需接受偏差时必须先建立并同步正式偏差记录，进度行不能自批。

### 8.4 Milestone 完成

```text
MILESTONE_DONE <M0|M1|M2|M3|M4|M5> tickets_closed=<k>/<N> gate=<P0|P1|P2> requirements_owned=<done/total> verify=GREEN e2e=<passed/required> threats=<passed/required> not_run=<0|N> evidence=<path>
```

最终绿灯格式：

```text
MILESTONE_DONE M5 tickets_closed=57/57 gate=P2 requirements_owned=193/193 verify=GREEN e2e=24/24 threats=20/20 not_run=0 evidence=release-evidence.md
```

必需平台或项目存在 `not_run>0` 时不得输出完整发布绿灯。

### 8.5 周期汇总

```text
PROGRESS_SUMMARY closed=<k>/57 active=<nn,...> blocked=<nn,...> waiting_gate=<nn,...> gate=P0:<x>/14,P1:<y>/31,P2:<z>/12 milestone=<M?> risk=<一句话> next=<下一批 READY tickets>
```

## §9 Ticket Quick Reference

| # | 切片 | 闸门 | 被阻塞于 | 端到端交付 |
|---:|---|---|---|---|
| 01 | BASE | P0 | 无 | 当前仓库、Node、构建与测试接缝成为可执行基线 |
| 02 | REF | P0 | 无 | SilverBullet 参考内容、许可与采用边界可审计 |
| 03 | CONTRACT | P0 | 01 基线 | Open 端统一使用不泄露本机路径的知识地址 |
| 04 | CONTRACT | P0 | 01 基线；03 Open 协议 | 用户获得稳定、脱敏且可追踪的错误诊断 |
| 05 | RESOURCE | P0 | 03 Open 协议；04 诊断 | 用户可使用 main 与互相隔离的会话来源 |
| 06 | RESOURCE | P0 | 03 Open 协议；04 诊断；05 来源 | 跨端资源变更走统一、安全的公开接缝 |
| 07 | RESOURCE | P0 | 05 来源；06 ResourceIO | 既有 Server、Desk、Workbench 保持兼容 |
| 08 | RESOURCE | P0 | 05 来源；06 ResourceIO；07 兼容入口 | Renderer 通过唯一知识客户端消费资源且旧 Desk 不回退 |
| 09 | RESOURCE | P0 | 05 来源；06 ResourceIO；07 兼容入口 | LAN/Mobile 获得同一来源隔离与隐私契约 |
| 10 | MUTATION | P0 | 04 诊断；06 ResourceIO | 用户可预览、提交并追踪可恢复的知识操作 |
| 11 | MARKDOWN | P0 | 02 SilverBullet；03 Open 协议 | Markdown 链接、标签、任务等共享同一语义 |
| 12 | MARKDOWN | P0 | 01 基线；02 SilverBullet；11 IR | Knowledge 与 Preview 复用策略驱动 CM6 表面 |
| 13 | PERF | P0 | 01 基线；03 Open 协议 | 大树、大文档、多来源和多标签有固定性能预算 |
| 14 | SECURITY | P0 | 03 Open 协议；04 诊断；05 来源 | 恶意工作区默认拒绝且有真实文件系统证据 |
| 15 | SHELL | P1 | 05 来源；08 Renderer client | 用户进入知识壳时看到空白 main 与单编辑组 |
| 16 | TREE | P1 | 06 ResourceIO；08 client；15 壳 | 用户浏览 main 与挂载来源的真实目录和文件 |
| 17 | ASSET | P1 | 06 ResourceIO；14 安全；15 壳 | 用户安全查看文本、图片、PDF、媒体和未知资产 |
| 18 | DOC | P1 | 08 client；12 CM6；17 Asset | 同页多视图共享文档状态且保持独立视图位置 |
| 19 | DOC | P1 | 06 ResourceIO；12 CM6；18 会话 | 用户可编辑并显式安全保存单个 Markdown |
| 20 | SHELL | P1 | 15 壳；18 会话 | 用户使用分组、标签、临时预览与真实面包屑 |
| 21 | DOC | P1 | 04 诊断；06 ResourceIO；19 保存 | 外部变化触发自动重载或显式三方冲突 |
| 22 | DOC | P1 | 05 来源；18–21 文档闭环 | 关闭、退出、来源丢失和切换不静默丢数据 |
| 23 | MARKDOWN | P1 | 05 来源；11 IR | 所有知识链接只在当前来源确定解析 |
| 24 | MARKDOWN | P1 | 11 IR；12 CM6；23 Resolver | 用户看到并导航 Wikilink/Markdown link 与断裂状态 |
| 25 | MARKDOWN | P1 | 11 IR；12 CM6；19 保存 | 用户编辑属性时未知 YAML、注释和顺序保持 |
| 26 | MARKDOWN | P1 | 11 IR；12 CM6；19 保存；25 Frontmatter | 用户编辑标签和页面任务并共享撤销历史 |
| 27 | MARKDOWN | P1 | 12 CM6；18 会话；24 链接 | 用户在 Live Preview 与源码模式间无损切换 |
| 28 | MARKDOWN | P2 | 27 Live Preview | Enter 可预测地延续或结束列表、任务和引用 |
| 29 | MARKDOWN | P2 | 27 Live Preview | Tab/Shift+Tab 对行级结构执行确定事务 |
| 30 | MARKDOWN | P2 | 27 Live Preview | 用户通过快捷键和斜杠菜单插入常用格式 |
| 31 | MARKDOWN | P2 | 27 Live Preview | 用户安全编辑预览 GFM 表格与代码块 |
| 32 | MARKDOWN | P2 | 20 分组；27 Live Preview | 软换行不改变源码导航且状态栏稳定 |
| 33 | MARKDOWN | P2 | 14 安全；27 Live Preview；31 代码块 | Mermaid 和数学静态渲染、错误隔离 |
| 34 | MARKDOWN | P2 | 11 IR；27 Live Preview | 用户定义、预览、补全并导航脚注 |
| 35 | SECURITY | P2 | 14 安全；17 Asset；23 Resolver；27 Preview | HTML、本地 URL 与外链按严格策略显示 |
| 36 | MARKDOWN | P2 | 20 分组；27 Preview | 用户在当前真实 Markdown 源码中查找替换 |
| 37 | MARKDOWN | P2 | 20 分组；23 Resolver；24 链接；27 Preview | 用户补全/导航 Wikilink 并延迟创建断裂页面 |
| 38 | MARKDOWN | P1 | 10 操作；23 Resolver；27 Preview | 附件落入同级 assets，跨来源先复制再引用 |
| 39 | MARKDOWN | P2 | 24 链接；33 Mermaid/Math；35 安全；37 补全 | 用户安全查看同源页面和章节嵌入 |
| 40 | INDEX | P1 | 01、04、05、10、13、14 | 每来源索引可健康检查、迁移和原子重建 |
| 41 | INDEX | P1 | 11、23、25、26、40 | 已保存 Markdown 的标题、属性、任务和链接可查询 |
| 42 | INDEX | P1 | 17 Asset；40 Store | 安全文本可检索，二进制/主动内容只留元数据 |
| 43 | INDEX | P1 | 06、10、40–42 | 外部变化、事件丢失和 rebuild 最终收敛磁盘 |
| 44 | QUERY | P1 | 23 Resolver；41 抽取；43 协调 | 用户查询来源内标签、引用、大纲与健康状态 |
| 45 | SEARCH | P1 | 20 分组；40 Store；43 协调；44 API | 用户跨当前来源搜索并按来源理解结果 |
| 46 | QUERY | P1 | 20 分组；24 链接；44 API | 当前大纲/出站反映 buffer，反链反映已保存索引 |
| 47 | TREE | P1 | 16 资源树 | 资源树选择、焦点、锚点与右键目标行为确定 |
| 48 | TREE | P1 | 47 选择状态机 | 用户用键盘完成单选、范围和非连续导航 |
| 49 | TREE | P1 | 20 分组；48 键盘 | 排序、临时预览、固定打开与标签复用一致 |
| 50 | MUTATION | P1 | 06、10、16、48 | 用户在明确目标目录安全新建 Page/文件夹 |
| 51 | NATIVE | P1 | 01、03、04、06、10、14、48 | 用户通过原生 Picker 安全导入文件/目录 |
| 52 | MUTATION | P1 | 10、14、38、48 | 会话内复制/剪切/粘贴与系统文件导入可解释 |
| 53 | MUTATION | P1 | 38、48、50–52 | 树和编辑器拖拽统一预检、效果与批次结果 |
| 54 | MUTATION | P1 | 10、18、21、23、43、48 | 同源重命名/移动原子更新文件和已保存链接 |
| 55 | TRASH | P1 | 10、18、22、43、47 | 删除先处理脏文档并进入来源级可恢复回收站 |
| 56 | TRASH | P1 | 04、10、14、23、44、51、55 | 用户恢复原位置、处理冲突并安全清理到系统废纸篓 |
| 57 | RELEASE | P2 | 09、13、14、22、33–36、39、45、46、53、54、56 | 汇总 24 E2E、平台、语言、性能、安全与迁移证据 |

### Lead 开篇清单

- [ ] 本 goal-plan、57 个 ticket、Gate 和依赖映射一致。
- [ ] 实际 issue 或本地 ticket 的编号/标签/引用关系已建立。
- [ ] Ticket 01 已在 Node 24 当场核验 audited ancestor、关键接缝、dirty 工作树、`better-sqlite3` 与 FTS5。
- [ ] SilverBullet 版本、许可证、8 个单文件和 3 个目录聚合哈希与矩阵一致。
- [ ] 每票 Primary ownership 唯一且 57 不拥有 KW-US。
- [ ] 每次派单载荷包含 I-implement、ADR、CONTEXT、goal-plan、ticket 和固定契约。
- [ ] 并发最多 6；allowlist 两两不重叠；共享文件 Lead-only。
- [ ] 所有 implementer/reviewer/fixer 都锁定 `gpt-5.6-sol`、medium。
- [ ] 每个 worktree 基线全绿；仅 Lead 操作 Git。
- [ ] 每票合并后门禁通过即自动删除对应 worktree 与临时分支。
- [ ] 每票完成后双轴审查、handoff、实际证据和进度行齐全。
