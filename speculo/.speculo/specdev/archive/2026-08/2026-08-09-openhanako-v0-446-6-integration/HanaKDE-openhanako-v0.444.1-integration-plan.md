---
title: "HanaKDE × openhanako v0.446.6 上游整合与 Resource / Knowledge 平台融合技术方案"
status: "Final Design / Implementation Blueprint"
version: "2.0"
date: "2026-08-09"
downstream_repository: "https://github.com/NAMEWTA/HanaKDE"
downstream_branch: "hanakde"
upstream_repository: "https://github.com/liliMozi/openhanako"
upstream_target: "v0.446.6"
upstream_target_commit: "5f08a4f30203abb61dafac7dbb7ab92d11c23efa"
---

# HanaKDE × openhanako v0.446.6 上游整合与 Resource / Knowledge 平台融合技术方案

> **文档性质：** 最终架构设计 + Merge 实施蓝图 + 验收规范  
> **核心原则：** Feature 做加法，Infrastructure 做减法；能力完整吸收，重复实现必须收敛。  
> **目标：** 在不破坏 HanaKDE 二次开发成果的前提下，将冻结的 openhanako v0.446.6（`5f08a4f30203abb61dafac7dbb7ab92d11c23efa`）新增、修复与优化真正吸收到 HanaKDE 基座，并借本次同步完成一次 Resource / Workspace / Knowledge 基础设施收敛，使以后追随上游的成本持续下降。

本版已按 `<Path>{roots.state}/specdev/changes/2026-08-09-openhanako-v0-446-6-integration/design-tree.json</Path>` 的最终共识校正。若本文仍有旧措辞与 design tree、CONTEXT 或 ADR 冲突，以上述 change 工件为权威并必须修正文档，不得恢复旧设计。

当前文件名保留 `v0.444.1` 仅用于追溯最初蓝图来源；本文 frontmatter、正文、Git target、实施阶段和 Definition of Done 均已升级为 `v0.446.6`，不得由文件名推断旧 target 仍有效。

交付模型固定为一个 umbrella change：使用 Deep Spec 统一外部合同，拆分纵向 Tickets，并由 Goal Plan 按 Wave 编排 ancestry、单 owner 切换、产品融合与双平台门禁。任何 Phase 都不能脱离 15 项 Definition of Done 单独宣称 change 完成。

---

# 0. 文档摘要

本次整合不应被理解为一次普通的 Git 冲突处理，也不应该被理解为：

- “保留 HanaKDE，拒绝上游”；
- “接受上游，覆盖二开”；
- “两边实现全部留下，以保证功能不丢”。

第三种做法看似最安全，实际上风险最大。因为两边在 2026 年 7 月下旬以后恰好同时对 **Resource、Workspace、文件监听、文件恢复、资源身份、知识索引、文件树刷新** 等基础设施进行了快速演进。

如果机械地把两边代码叠加，最终很容易形成：

```text
FileHistory watcher
Knowledge watcher
Resource watcher
Desktop watcher

Upstream path canonicalization
HanaKDE root identity
Knowledge path normalization
FileHistory workspace hash

Upstream file refresh
Knowledge refresh
Desk refresh
Workbench refresh
```

这不是“功能完整”，而是形成多个互相竞争的事实源。

本方案因此将整合原则定义为：

> **功能层采用并集；基础设施层采用单一事实源。**

具体而言：

- 上游 **File History** 的 byte-level 历史、版本、diff、restore、retention 完整保留；
- HanaKDE **Knowledge Workspace** 的 Semantic IR、Source Registry、Knowledge Index、Search、Projection 完整保留；
- 上游 **Document Extract** 完整吸收，并提升为 File Tool 和 Knowledge Ingestion 共用的系统能力；
- 上游 **Materialize** 保留；
- HanaKDE **provider-neutral Transfer** 保留；
- HanaKDE **Root Identity** 从二开增强提升为 Resource Kernel 的唯一物理根身份模型；
- HanaKDE **ResourceEventBus** 的内部订阅、序列和 catch-up 能力作为统一事件总线保留；
- 上游 **recursive watcher + baseline sweep** 的成熟经验吸收，但 watcher 本身从 FileHistory 私有实现提升为 Workspace Infrastructure；
- Knowledge、FileHistory、Desk/Workbench 不再分别持有对同一根目录的重复物理 watcher；
- FileHistory DB 和 Knowledge DB **绝不合并**；
- FileHistory 只为 `main` 使用私有 `historyStoreKey` 定位自身存储；该键不是公共 Workspace 身份，也不被其他功能依赖；
- 文件历史、知识索引、UI 可见性和文件系统监听不共享一个粗暴的 `ignore` 列表，而改为独立 policy。
- Workspace File History 与 Agent 对话文件变更历史保留各自 scope 和入口，但共享 ResourceIO、ResourceEventBus、版本、快照、diff、restore 与物理观察 primitive。
- HanaKDE 尚未发布，本轮直接建立新基线，不设计 legacy migration、旧 Profile 导入、兼容窗口或 migration rollback。

最终目标架构：

```text
┌────────────────────────────────────────────────────────────┐
│                     HanaKDE Product Layer                  │
│                                                            │
│  Workbench / Desk / Knowledge UI / History UI / @Mention  │
│  Future Personal Workbench Apps & Plugins                  │
└──────────────────────────────┬─────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────┐
│                     Resource Services                      │
│                                                            │
│ FileHistoryService     DocumentExtractionService           │
│ KnowledgeIndexService  TransferService                     │
└──────────────────────────────┬─────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────┐
│                       Resource Kernel                      │
│                                                            │
│ ResourceRef / Provider / Access Policy / Root Identity     │
│ read / write / stat / list / copy / materialize / transfer│
│ ResourceEventBus / operation correlation / version         │
└──────────────────────────────┬─────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────┐
│                   Workspace Infrastructure                 │
│                                                            │
│ MainWorkspaceRuntime / WorkspaceWatchCoordinator           │
│ BaselineReconciler / Workspace Policies                    │
└──────────────────────────────┬─────────────────────────────┘
                               │
                               ▼
                  Local / Mount / Remote Providers
```

本次 merge 的真正完成标准不是：

> “所有 Git conflict 都消失。”

而是：

> **openhanako v0.446.6 成为 HanaKDE 的新基座祖先，同时 HanaKDE 二开能力全部收敛到清晰的架构边界上，重复基础设施被删除，Resource → Workspace → History → Knowledge → UI 的数据一致性形成闭环。**

---

# 1. 背景与当前状态

## 1.1 仓库角色

上游：

```text
liliMozi/openhanako
```

下游：

```text
NAMEWTA/HanaKDE
```

HanaKDE 当前实际开发基线：

```text
hanakde
```

本轮建议固定的上游整合目标：

```text
v0.446.6
5f08a4f30203abb61dafac7dbb7ab92d11c23efa
```

**不得直接以持续移动的 `upstream/main` 作为本轮 merge 输入。**

固定 tag 的意义在于：

1. 代码输入可复现；
2. 冲突集合可冻结；
3. 测试结果可重复；
4. 架构审计有明确边界；
5. 本轮完成后再单独审计 `v0.446.6..upstream/main`。

---

## 1.2 当前分叉规模意味着什么

截至 2026-08-08 的 GitHub 跨 fork 比较中，两边都已经存在数量较大的独立提交与文件变化。这个数字只能用来衡量“同步规模”，不能简单等同于真正未吸收的 patch 数，因为：

- 可能存在 patch-equivalent commit；
- HanaKDE 可能独立实现了相同功能；
- 一些功能可能此前被手工同步；
- merge-base 后双方可能对同一功能做了不同实现。

2026-08-09 G Work 的本地审计快照为：下游 HEAD `bf4c6ee57891324fe686f63780092f5240e61bec`，目标 `v0.446.6`，merge-base `ef8a6f700191c2486effd3761a4bd2b7f3ad774c`，两侧提交计数 `201/286`，HanaKDE/上游差异文件 `747/671`，双方 overlap `50`。这些是规划证据，不是实施时永久基线；真正创建 integration branch/worktree 前必须重新冻结当时 HEAD 并重算。

因此实施时必须用：

```bash
git log --left-right --cherry-pick --oneline hanakde...v0.446.6
git cherry hanakde v0.446.6
```

计算 patch equivalence，而不是仅凭 GitHub 的 commit 数量决策。

---

# 2. 本轮整合的核心问题不是 Git，而是所有权

双方最大的冲突区集中在：

```text
Resource
Workspace
Filesystem Change
Watcher
History
Restore
Knowledge Index
Search
Desktop Refresh
```

本质上是因为双方在分叉后都开始回答同一组系统问题：

- 一个 Workspace 到底是谁？
- 一个文件的真实身份如何确认？
- 文件路径是否越界？
- Windows 大小写、junction、symlink 如何判断？
- 一个文件变化由谁观察？
- Agent 自己写文件后谁负责广播？
- 用户在 VS Code 修改后谁负责发现？
- watcher 丢事件后谁负责最终一致性？
- rename/delete 如何映射？
- restore 如何让 UI、History、Knowledge 同时更新？
- Office 文档如何变成 Agent/Knowledge 可理解内容？
- Remote Resource 如何进入本地工具？
- Provider A 的资源如何可靠移动到 Provider B？

如果不先决定这些基础问题的 owner，Git 冲突即使全部解决，系统仍会存在隐性冲突。

因此本方案首先冻结系统所有权。

---

# 3. 总体设计原则

## 3.1 Feature Union, Primitive Single Source of Truth

允许：

```text
File History + Knowledge Index
Materialize + Transfer
Physical History + Semantic State
File Search + Semantic Search
```

不允许：

```text
Watcher A + Watcher B + Watcher C
Path Identity A + Path Identity B
Baseline Sweep A + Baseline Sweep B
Root Security Check A + Root Security Check B
```

---

## 3.2 功能不等于代码

“保留所有能力”绝不意味着“保留双方所有实现文件”。

例如：

上游：

```text
lib/file-history/workspace-watcher.ts
```

具有非常有价值的 recursive watch、symlink policy、debounce 和错误恢复经验。

但最终不代表这个文件必须继续作为：

> FileHistory 自己拥有的 watcher owner。

更合理的结果是：

```text
把成熟实现迁入：
WorkspaceWatchCoordinator
```

然后：

```text
FileHistory
Knowledge
Desk
Plugin
```

作为消费者。

因此：

> **可以删除上游文件，而完整吸收上游能力。**

同样：

> **可以删除 HanaKDE 旧 watcher，而完整保留 HanaKDE Knowledge 功能。**

---

## 3.3 更强契约优先，而不是“谁是上游谁优先”

对于真正的 platform primitive，一般以 upstream 为 authority。

但如果 HanaKDE 已经建立了更强且被测试保护的安全契约，则不能为了“跟上游”而降级。

例如 HanaKDE 的：

```text
ProviderRootIdentityBroker
realpath-based identity
case semantics
TOCTOU revalidation
provider-neutral transfer limits
```

如果比上游 path-based 判断更严格，那么正确做法是：

> 将 HanaKDE 的强化能力提升进新的 Resource Kernel，并让新上游功能使用它。

不是把强化能力删除。

---

## 3.4 不为“架构漂亮”制造无价值重构

本轮整合只抽象具有以下至少一项价值的能力：

- 已经有两个以上真实消费者；
- 双方当前已有重复实现；
- 涉及安全边界；
- 涉及数据一致性；
- 会显著降低下一次 upstream merge 成本；
- 是 Personal Workbench 长期基础能力。

禁止仅为了统一命名而大规模移动目录。

---

# 4. 上游 v0.442.0 → v0.446.6 的核心变化

# 4.1 Workspace File History

上游新增了完整 Workspace File History：

```text
文件变化
  ↓
Capture
  ↓
Snapshot Store
  ↓
Version Timeline
  ↓
Diff
  ↓
Restore
```

主要行为包括：

- 自动记录文本文件变化；
- 不要求变化来源必须是 Agent；
- 外部编辑器修改同样能够被捕获；
- 删除文件历史仍可查看；
- 支持 line-level diff；
- 支持 restore；
- restore 本身再次产生可恢复版本；
- 单文件快照有限制；
- 有版本合并窗口；
- 有仅属于当前 `main`、与其他运行时数据隔离的数据库；
- 有 retention；
- 有总空间限制；
- 有 baseline sweep。

该能力应完整吸收，但 Workspace File History 的产品范围只包含当前主 Workspace `main`。额外挂载目录继续拥有文件管理、编辑和 Knowledge 能力，不创建 Workspace File History，也不建立第二个 history DB。

---

# 4.2 File History 三类变更来源

上游最值得保留的架构思想不是 UI，而是：

```text
Internal Mutation
Resource Event
      │
      ▼
    Capture


External Mutation
OS Watcher
      │
      ▼
    Capture


Lost Event / Recovery
Baseline Sweep
      │
      ▼
Reconciliation
```

这三个通道解决三个不同问题。

### Resource Event

优点：

- 低延迟；
- 系统知道修改发生；
- 可以带 operation context；
- 不依赖 OS watcher。

### OS Watcher

负责：

- VS Code；
- shell；
- 第三方编辑器；
- 系统外部修改。

### Baseline Sweep

负责：

- macOS 等平台事件丢失；
- watcher 错误；
- app suspend/resume；
- 网络/挂载抖动后的最终一致性。

**三条通道都必须保留。**

需要删除的是：

> 每个业务服务分别实现这三条通道。

---

# 4.3 从 per-file watcher 到 recursive watcher

上游已经在真实问题中证明：

```text
一个文件一个 watcher
```

在大型工作区会造成文件描述符线性增长，甚至进一步影响 child process / shell spawn。

后续上游改成：

```text
一个 workspace root
        │
        ▼
ONE recursive watcher
        │
        ▼
event-level filtering
```

同时保留 baseline sweep。

这个修复必须完整吸收，而且需要进一步升级为：

```text
ONE watcher per physical workspace observation scope
```

而不是只在 FileHistory 内使用。

---

# 4.4 Document Extract

上游新增 `lib/document-extract/`，并为 File Tool 增加 Office / document extraction。

能力覆盖：

```text
DOCX
XLSX
PPTX
PDF
CSV
ODT / ODS / ODP
RTF
EPUB
HTML
...
```

输出统一为：

```text
Markdown
```

并区分：

```text
too-large
unsupported
scanned-pdf
parse-failed
```

当前实现具有一个非常好的设计特征：

> extraction 核心本身主要处理 bytes / local file，不自行拥有 session / engine / authorization。

也就是说，它天然适合提升为系统公共服务，而不是继续只挂在 Agent File Tool 下。

---

# 4.5 ResourceIO Materialize

Materialize 解决：

> 抽象 Resource 如何临时变成只接受本地路径的工具可以使用的对象。

语义：

```text
Resource
   │
   ▼
materialize
   │
   ▼
local usable path
```

对于 local resource，可以直接返回合法本地路径。

对于 remote / abstract resource，可以 staging 为本地 copy。

Materialize 是：

```text
Resource → Local Tool Compatibility
```

不是资源迁移。

---

# 4.6 Workspace `@` 文件搜索生命周期修复

上游修复的是：

> async input/search lifecycle

而不是重新发明 Knowledge Search。

因此应吸收：

- query state；
- loading；
- candidate lifecycle；
- cancellation / stale response handling；
- menu update 时序。

如果 HanaKDE 已经拥有 Knowledge Provider，则保留其 search backend。

---

# 4.7 v0.444.1 → v0.446.6 正常上游迭代

冻结的 `v0.446.6` 是 `v0.444.1` 的后代；两者之间包含 11 个提交、51 个变更文件。除前述 Resource / History / Extraction 主线外，还必须正常吸收：

```text
per-agent Memory Dream
compaction menu priority fix
Markdown bare URL visibility fix
对应的 Agent settings / persistence / build changes
```

这些属于上游正常功能、修复和优化，默认完整接受。只有与 HanaKDE 已确认的 Memory ticker、Facts/Long-term 编译、持久化 registry、Agent settings 或安全/数据开放边界发生真实合同冲突时，才进行语义融合；不得为旧内部实现创建兼容壳。

---

# 5. HanaKDE 当前必须保护的增强

# 5.1 Root Identity

HanaKDE 已经不再把：

```text
path.resolve(root)
```

直接等价于：

> 物理根目录身份。

现有 Root Identity 能力考虑：

```text
realpath
stat
device/inode when reliable
case-sensitive / insensitive semantics
NFC / comparison normalization
opaqueRootId
scopeToken
provider namespace
```

并可以对两个 root 判断：

```text
same
ancestor
descendant
disjoint
unknown
```

该能力应被提升为统一 Resource Kernel 的正式组成部分。

---

# 5.2 Provider-neutral Transfer

HanaKDE 的 Transfer 不等于简单 `copyFile()`。

它已经开始建立：

```text
Provider A
   │
 export
   ▼
Transfer Plan
   │
validation / budget / version
   ▼
atomic import
   │
   ▼
Provider B
```

并具有明确固定限制，例如：

```text
chunk ≤ 1 MiB
concurrent file streams ≤ 4
process transfer buffer ≤ 8 MiB
plan entries ≤ 100000
depth ≤ 128
aggregate size ≤ 100 GiB
```

这些限制属于安全/资源预算契约，不应因 upstream merge 被弱化。

---

# 5.3 ResourceEventBus

HanaKDE 的 ResourceEventBus 已经具有适合本轮整合的重要能力：

```text
internal subscribe()
sequence
recent event retention
since(sequence)
stale detection
changed-event dedup
```

因此无需再为 FileHistory 建一条 engine-specific 私有 event tap。

最终应由：

```text
ResourceEventBus
```

成为 in-process resource mutation 的统一 fan-out。

---

# 5.4 Knowledge Workspace

HanaKDE 必须保留：

```text
Semantic IR
Source Registry
Knowledge Index
Semantic Search
Projection
Resource integration
Workbench
Windows / security gates
```

但 Knowledge 不应继续拥有：

> 与 FileHistory / Resource 基础设施重复的物理文件系统职责。

---

# 5.5 当前仓库真实起点

本轮不是从零创建 Resource/Workspace 平台。当前 HanaKDE 已经存在：

- `<Path>lib/resource-io/resource-watch-registry.ts</Path>`：按 Resource/refCount 共享 backend watch；
- `<Path>lib/resource-io/resource-event-bus.ts</Path>`：sequence、subscribe、since/stale 与版本去重；
- `<Path>lib/resource-io/root-identity.ts</Path>`：ProviderRootIdentityBroker；
- `<Path>core/knowledge-workspace/knowledge-index-runtime.ts</Path>`：Knowledge 消费 Resource 观察/事件的运行时，但 rebuild 仍有来源扫描；
- `<Path>desktop/workspace-watch-registry.cjs</Path>` 与 `<Path>desktop/file-watch-registry.cjs</Path>`：仍需逐项审计的 Electron legacy watcher/lifecycle bridge；
- `<Path>plugins/office/</Path>`：通过 ResourceIO materialize 读取 DOCX/XLSX/PDF 等格式的现有 Office 插件。

当前分支尚无完整 File History 和 `<Path>lib/document-extract/</Path>`。因此实施目标是：

```text
演进现有 ResourceWatchRegistry / ResourceEventBus / Knowledge pipeline
补齐 main baseline / reconciliation 与 physical-root 去重
吸收上游 File History / Document Extraction / Memory 等正常变化
验证后退役真正重复的 Desktop watcher 与 Office parser
```

不得机械新增第二个 Watch Registry、第二个事件总线或第二套 Office parser。Desktop watcher 只有被证明是独立 physical observation owner 时才删除；若只是 Electron lifecycle/IPC bridge，则保留 bridge 并让其消费统一 owner。

---

# 6. 最终架构：五层模型

# 6.1 Layer 1 — Provider / Filesystem

最低层只回答：

```text
资源实际存在哪里？
如何执行原始 I/O？
```

包括：

```text
Local filesystem
Mount
Remote provider
future cloud provider
```

Provider 不应该知道：

- Knowledge；
- FileHistory；
- Workbench；
- Agent UI。

---

# 6.2 Layer 2 — Resource Kernel

这是本次整合的核心。

建议职责：

```text
ResourceRef
Resource Provider Resolution
Resource Access Policy
Root Identity
Path / scope security
read
write
stat
list
copy
materialize
transfer
Resource Version
Resource EventBus
operation context
```

Resource Kernel 不知道：

- Knowledge 的 heading/block；
- FileHistory 的 retention；
- UI。

---

# 6.3 Layer 3 — Workspace Infrastructure

Workspace 是：

> 当前用户选择的工作目录，也就是唯一主 Workspace `main` 的生命周期域。

职责：

```text
MainWorkspaceRuntime
main root open/switch/close
WorkspaceWatchCoordinator
BaselineReconciler
Workspace policy
main workspace lifecycle
```

额外挂载目录由既有来源/挂载能力管理。它们可以消费统一 ResourceIO、观察和 Knowledge 能力，但不是额外 Workspace，也不进入 Workspace File History。

---

# 6.4 Layer 4 — Resource Services

包括：

```text
FileHistoryService
DocumentExtractionService
KnowledgeIndexService
TransferService
```

这些 service 可以消费 Resource Kernel 和 Workspace Infrastructure。

它们之间不允许形成循环依赖。

---

# 6.5 Layer 5 — Product Layer

包括：

```text
Desk
Workbench
File Preview
Workspace History UI
Agent File Changes UI
Knowledge UI
@ Mention
Agent Tool
Future Personal Workbench Apps
Plugins
```

Product Layer 不应直接调用原始 OS watcher。

---

# 7. `main` Workspace 与资源身份

# 7.1 唯一主 Workspace

工作目录就是唯一主 Workspace `main`：

```text
选择/切换工作目录
        ↓
关闭旧 main 生命周期
        ↓
打开新的 main 生命周期
```

本轮不提供 Workspace relocation，也不让目录移动后延续旧 Workspace 身份。额外挂载目录只是当前 `main` 下的附加来源；切换 `main` 时按既有产品合同处理挂载生命周期。

---

# 7.2 复用现有身份 primitive

不引入用户可见或跨功能公共 `workspaceId`。各 primitive 只回答自己的问题：

```ts
export interface MainWorkspaceContext {
  sourceKey: "main";
  root: ResourceRef;
  rootIdentity: ProviderRootIdentity;
  historyStoreKey: string;
}
```

- `sourceKey=main`：来源路由；
- `root`：当前资源位置；
- `rootIdentity`：物理身份、安全范围与替换检测；
- `historyStoreKey`：仅供 File History 定位私有存储，不是公共身份，也不得被 Knowledge、Workbench 或插件依赖。

原始 path hash 可以作为 File History 私有键的内部实现候选，但不得提升为安全证明、公共 API 参数或跨功能长期身份。

---

# 7.3 MainWorkspaceRuntime

MainWorkspaceRuntime 只协调已有生命周期和共享基础设施，不建立多 Workspace Registry：

```ts
interface MainWorkspaceRuntime {
  current(): Promise<MainWorkspaceContext | null>;
  open(root: ResourceRef): Promise<MainWorkspaceContext>;
  revalidate(): Promise<MainWorkspaceContext>;
  close(): Promise<void>;
}
```

实际类型与路径应服从当前 HanaKDE 已有 Workspace/Knowledge lifecycle；只有当新抽象能删除真实重复 owner 时才新增，不为对齐本文示意代码制造包装层。

---

# 7.4 Root Identity 变化语义

同一路径被另一个 junction、inode 或物理目录替换时，应：

```text
rootIdentity mismatch
        │
        ▼
FAIL CLOSED
        │
        ├── pause affected sensitive write
        ├── pause history restore
        ├── pause transfer
        └── require revalidation / reattach
```

这属于正常运行时安全合同，不是 relocation 或数据迁移流程。切换到另一个工作目录则直接打开新的 `main`，不继承旧 History 身份。

---

# 8. WorkspaceWatchCoordinator：唯一物理观察层

# 8.1 目标

`WorkspaceWatchCoordinator` 是目标职责名，不要求新增一套与现有 ResourceWatchRegistry 并列的 registry。优先演进 `<Path>lib/resource-io/resource-watch-registry.ts</Path>` 或在其上形成唯一薄协调层；最终只能有一个 physical observation owner。

最终禁止：

```text
FileHistory 自己监听 workspace
Knowledge 自己监听 workspace
Desk 自己监听 workspace
Plugin 自己监听 workspace
```

改成：

```text
                   WorkspaceWatchCoordinator
                              │
                       physical watcher
                              │
                              ▼
                     normalized observation
                              │
                              ▼
                       ResourceEventBus
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
        FileHistory       Knowledge          UI
```

---

# 8.2 物理 watcher 不等于 logical subscription

Coordinator 可以对一个 physical root 有多个逻辑消费者：

```text
Physical Watcher
   └── Root A
        ├── FileHistory subscription
        ├── Knowledge subscription
        └── UI subscription
```

消费者增加不增加 OS watcher。

---

# 8.3 `main` 与额外挂载的嵌套观察范围

对于：

```text
/root
/root/projectA
```

这表示一个 `main` root 与一个额外挂载/观察 root，不能简单说：

> 永远只 watch 最顶层 root，或把挂载提升为第二个 Workspace。

因为那可能把观察范围扩展得过大。

正确策略：

1. Root Identity Broker 判断 relation；
2. Coordinator 维护进程内 physical root observation registry；
3. 只有在安全 scope、policy 和性能上允许时复用 ancestor watcher；
4. 否则为不同 canonical root 建立独立 watcher；
5. 但无论如何，**同一个 canonical root 不允许因不同 service 创建重复 watcher**。

系统 invariant：

```text
physicalWatcherCount(
  canonicalRootIdentity
) <= 1
```

Workspace File History 仍只订阅 `main`。额外挂载是否被 Knowledge/UI 观察由各自 policy 决定，但不得因此建立第二个物理 watcher owner。

---

# 8.4 Symlink / Junction

默认：

```text
不递归 follow directory symlink
```

保持与 baseline scan 一致。

任何 watcher event 在转换为 ResourceEvent 前必须：

```text
normalize
  ↓
resolve against workspace
  ↓
root identity / scope check
  ↓
reject escape
```

---

# 9. BaselineReconciler：最终一致性的唯一 Owner

BaselineReconciler 同样是职责边界，不授权在现有 Knowledge rebuild 与上游 sweep 之外再并列第三套扫描。应把 main baseline observation 收敛到唯一 owner，让 History/Knowledge 只做 scoped repair。

# 9.1 为什么不能每个服务自己 sweep

如果：

```text
FileHistory 每天 scan
Knowledge 每天 scan
Desk 定时 scan
```

大 workspace 会产生重复：

```text
stat
read
hash
walk
```

而且三个服务可能在不同时间形成三个不同的“当前状态”。

---

# 9.2 目标结构

```text
             BaselineReconciler
                    │
                    ▼
           Workspace Snapshot
                    │
          version / identity
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
    History     Knowledge       UI
```

BaselineReconciler 的职责不是：

> 直接重建 Knowledge。

而是产生：

```text
Observed Resource State
```

让消费者决定如何修复。

---

# 9.3 触发条件

至少：

```text
main open/switch
mount attach/detach
watcher error
watcher degraded
app resume
event gap detected
periodic fallback
explicit repair
```

---

# 10. 统一 Resource Mutation / Event 模型

# 10.1 内部写入和外部观察必须区分

内部：

```text
Agent
  ↓
ResourceIO.write
  ↓
authoritative mutation
  ↓
ResourceEventBus
```

外部：

```text
VS Code
  ↓
filesystem
  ↓
watcher
  ↓
observed mutation
  ↓
ResourceEventBus
```

二者最终进入同一总线，但来源语义不同。

---

# 10.2 建议增加可选 correlation metadata

为了保持现有外部事件兼容，建议采用 additive metadata，而不是重写全部事件协议。

示意：

```ts
export type ResourceEventOrigin =
  | "agent"
  | "desktop"
  | "external"
  | "transfer"
  | "history_restore"
  | "import"
  | "initialization"
  | "sweep";

export interface ResourceEventContext {
  operationId?: string;
  causationId?: string;
  origin?: ResourceEventOrigin;

  observedBy?:
    | "resource_io"
    | "watcher"
    | "reconciler";
}
```

现有 consumer 不识别 context 仍然可工作。

---

# 10.3 Watcher Echo 去重

典型情况：

```text
ResourceIO.write(foo)
  ↓
event #1
```

20ms 后：

```text
OS watcher
  ↓
foo changed
  ↓
event #2
```

不能产生两个完整业务变更。

建议 coalesce key：

```text
canonical resource key
+
resource version/content fingerprint
+
change type
+
recent operation correlation when available
```

判断：

```text
同一版本 + 同一变更
    ↓
watcher observation 作为确认
    ↓
不重复广播高层 mutation
```

---

# 10.4 ResourceEventBus 继续承担序列与 catch-up

HanaKDE 已有：

```text
sequence
since(sequence)
stale
```

应继续保留。

消费者可以保存：

```text
lastProcessedSequence
```

重启或短暂离线后：

```text
bus.since(lastProcessedSequence)
```

如果：

```text
stale = false
```

则增量恢复。

如果：

```text
stale = true
```

则触发 scoped reconciliation，而不是盲目 full rebuild。

---

# 11. FileHistoryService 的最终归属

# 11.1 完整保留的上游能力

保留：

```text
history store
snapshot
merge window
text file policy
deleted-file history
version list
diff
restore semantics
retention
workspace quota
capture origin
```

---

# 11.2 从 FileHistory 中移出的职责

移出：

```text
physical watcher ownership
workspace path identity authority
独立 baseline scanner ownership
security root authority
```

这些转移到：

```text
Workspace Infrastructure
Resource Kernel
```

---

# 11.3 FileHistory 最终依赖

```text
FileHistoryService
   │
   ├── MainWorkspaceRuntime
   ├── ResourceEventBus
   ├── ResourceIO
   ├── HistoryStore
   └── HistoryCapturePolicy
```

不直接依赖：

```text
Knowledge
Workbench
OS watcher API
```

---

# 12. FileHistory DB 私有存储身份

# 12.1 唯一新基线

HanaKDE 当前尚未发布 Workspace File History，本轮直接建立唯一新存储基线：

```text
runtime-data/
  file-history/
    <historyStoreKey>/
      history.sqlite
```

`historyStoreKey` 只属于 FileHistory 持久化实现。它可以由规范化 root 信息安全派生，也可以使用随机私有键，但必须满足：

```text
不暴露 raw path
不作为 Root Identity
不成为公共 API
不被 Knowledge / Workbench / Plugin 依赖
只为当前 main 建库
```

---

# 12.2 明确不设计 migration

本轮不实现：

```text
LegacyWorkspaceHistoryLocator
旧 path-hash DB 发现/导入
旧 Profile 导入
migration marker
兼容窗口
migration rollback
旧数据清理流程
```

原因不是忽略数据安全，而是 HanaKDE 尚未发布，不存在必须保护的旧用户 File History 数据路径。新库初始化失败进入统一 `FAILED` 健康状态并支持 scoped retry；它是运行时错误，不是迁移状态。

---

# 13. File History 与 Knowledge：必须共享事件，不共享数据库

# 13.1 File History

保存：

> physical byte history。

回答：

```text
某个时间点文件是什么？
发生了什么文本变化？
能否恢复？
```

---

# 13.2 Knowledge

保存：

> semantic derived state。

回答：

```text
有哪些 heading？
有哪些 block？
有哪些 reference？
有哪些语义？
怎么检索？
```

---

# 13.3 禁止

禁止：

```text
Workspace File History 与 Agent 对话文件变更历史各自创建 watcher、snapshot store 或 restore 写入通道
```

两者保留不同查询 scope 和产品入口：Workspace 视图只覆盖 `main`，Agent 视图按对话/操作投影相关变化；底层 ResourceIO、ResourceEventBus、版本、快照、diff、restore 和物理观察必须复用。

禁止：

```text
Knowledge IR 直接存入 FileHistory DB
```

禁止：

```text
FileHistory snapshot 直接作为 Knowledge persistence
```

禁止：

```text
Restore 直接操作 Knowledge DB
```

---

# 14. Restore 的统一闭环

Restore 是本次整合最关键的数据一致性场景。

目标：

```text
History Version A
       │
       ▼
REST / Domain Restore Handler
       │
       ├── authorization
       ├── workspace revalidation
       ├── expected version check
       ▼
ResourceIO.write
 origin=history_restore
 operationId=...
       │
       ▼
ResourceEventBus
       │
       ├───────────────┐
       ▼               ▼
FileHistory        Knowledge
capture restore    invalidate old source
       │               │
       │             re-read
       │               │
       │             re-extract if needed
       │               │
       │             reparse/reindex
       │               │
       └───────┬───────┘
               ▼
          Workbench / UI
```

最终 invariant：

```text
Disk Version
=
Preview Version
=
FileHistory Current State
=
Knowledge Source Version
=
Agent Read Version
```

---

# 15. DocumentExtractionService

# 15.1 为什么必须从 File Tool 提升出来

如果只保留：

```text
file.extract()
```

那么 Knowledge Workspace 将来可能自己再写：

```text
docx parser
pdf parser
pptx parser
```

形成重复基础设施。

正确结构：

```text
                  DocumentExtractionService
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
       Agent File Tool         Knowledge Ingest
```

HanaKDE 现有 Office 插件中的 mammoth、ExcelJS、PDF 等解析路径视为本次正常升级面：与上游 Extraction 语义重叠的 parser 在行为验证后删除；只有 HTML/JSON 等真实差异输出作为共享服务上的适配器保留。不得为了旧插件内部函数维持并列 parser。

---

# 15.2 建议接口

```ts
export interface ExtractedDocument {
  markdown: string;
  format: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentExtractionService {
  canExtract(
    resource: ResourceRef
  ): Promise<boolean>;

  extract(
    resource: ResourceRef,
    options?: {
      maxBytes?: number;
    }
  ): Promise<ExtractedDocument>;
}
```

内部可以继续复用 upstream 的：

```text
extractDocument(buffer | filePath)
```

---

# 15.3 Authorization 边界

Extraction 核心不应该自己拥有授权逻辑。

调用链：

```text
Caller
  ↓
ResourceAccessPolicy
  ↓
authorized ResourceRef
  ↓
ResourceIO / Materialize
  ↓
DocumentExtractionService
```

---

# 15.4 Remote Resource

如果 Resource 是 remote：

方案 A：

```text
ResourceIO.read
  ↓
bounded Buffer
  ↓
extract
```

方案 B：

当 native converter 必须接收 path：

```text
Resource
  ↓
materialize
  ↓
temporary local file
  ↓
extract
```

Materialize 生命周期结束后清理 staging。

---

# 15.5 Extraction Cache

建议 cache key：

```text
resource stable key
+
resource version
+
extractor version
```

绝不能只用：

```text
path
```

否则 restore 或外部替换后可能使用旧 extraction。

---

# 15.6 不把 Derived Markdown 当用户源文件

例如：

```text
report.docx
   ↓
extract
   ↓
Markdown
```

默认这个 Markdown 是：

```text
Derived Representation
```

而不是：

```text
User Resource
```

不能未经用户要求自动在 workspace 写出：

```text
report.md
```

否则会产生：

- 文件重复；
- history 重复；
- watcher 循环；
- Knowledge 重复索引；
- 用户目录污染。

---

# 15.7 OCR 不在本轮范围

上游能够识别：

```text
scanned-pdf
```

本轮应保留这个结构化错误。

不应为了“功能完整”顺便引入 OCR stack。

未来：

```text
OCR Provider / Plugin
```

可以消费 `scanned-pdf` fallback。

这是一个明确的“有取舍融合”案例。

---

# 16. Materialize / Transfer / Copy 的职责必须分离

# 16.1 Copy

```text
Resource A
  ↓
same provider / provider-supported copy
  ↓
Resource B
```

强调：

> provider-native copy semantics。

---

# 16.2 Transfer

```text
Provider A
  ↓
export
  ↓
validated transfer plan
  ↓
atomic import
  ↓
Provider B
```

强调：

> cross-provider committed resource movement/copy。

保留 HanaKDE transfer safety contract。

---

# 16.3 Materialize

```text
Abstract Resource
  ↓
materialize
  ↓
temporary/local compatible path
  ↓
path-only tool
```

强调：

> compatibility projection。

---

# 16.4 禁止合并成一个万能函数

不要：

```ts
resourceIO.moveOrCopyOrMaterialize(...)
```

三个动作的：

- 生命周期；
- 数据所有权；
- rollback；
- security；
- side effect；

完全不同。

---

# 17. Workspace Policy 拆分

不使用一个：

```ts
ignoredPaths
```

控制所有业务。

建议：

```ts
interface WorkspacePolicies {
  watch: WatchPolicy;
  history: HistoryCapturePolicy;
  knowledge: KnowledgeIndexPolicy;
  visibility: UIVisibilityPolicy;
}
```

---

# 17.1 WatchPolicy

回答：

> 为最终一致性是否需要观察？

例如内部目录可能仍然需要 watch 以发现 root changes，但不进入 Knowledge。

---

# 17.2 HistoryCapturePolicy

回答：

> 是否应该长期保存 byte history？

首要前置条件是 `sourceKey=main`；额外挂载和 remote/non-local provider 本轮直接返回不捕获。

例如：

```text
node_modules
build
lock
log
temporary
runtime db
```

一般不保存。

---

# 17.3 KnowledgeIndexPolicy

回答：

> 该 Resource 是否应成为用户知识？

例如：

```text
.speculo runtime
history.sqlite
knowledge index db
cache
```

必须排除。

---

# 17.4 UIVisibilityPolicy

回答：

> 用户文件树是否展示？

与 Knowledge/History 不等价。

---

# 18. Knowledge Workspace 事件化重构

# 18.1 删除 Knowledge 自己的原始物理监听职责

目标：

```text
Knowledge
   × 不直接 new OS watcher
```

而是：

```text
ResourceEventBus.subscribe(...)
```

---

# 18.2 Source State 应记录版本

建议每个 Knowledge Source 至少记录：

```ts
interface IndexedSourceState {
  resourceKey: string;
  sourceVersion?: string;
  extractionVersion?: string;
  parserSchemaVersion: string;
}
```

这样 ResourceEvent 到来时：

```text
当前 version == indexed version
        ↓
NO-OP
```

否则：

```text
re-read / re-extract / reparse
```

---

# 18.3 文本文件

```text
ResourceChanged
  ↓
read
  ↓
Markdown parser
  ↓
Semantic IR
  ↓
index
```

---

# 18.4 Office 文件

```text
ResourceChanged
  ↓
DocumentExtractionService
  ↓
Derived Markdown
  ↓
Semantic IR
  ↓
index
```

---

# 18.5 Delete

```text
ResourceDeleted
  ↓
Source Registry tombstone / remove
  ↓
search invalidate
```

FileHistory 仍可保留 deleted history。

---

# 18.6 Rename

Rename 不应一律重新解析全部内容。

如果能够证明：

```text
same physical resource
same content version
```

则：

```text
update resource/path metadata
update path-based references
```

必要时局部 reindex。

如果跨 workspace/provider：

```text
old delete
+
new create/transfer
```

语义处理。

---

# 19. `@ Mention` 与搜索融合

上游异步搜索生命周期修复应完整吸收。

但搜索 provider 应保留 HanaKDE 产品能力。

建议最终：

```text
@ query
  │
  ▼
Search Coordinator
  │
  ├── Workspace File Candidate Provider
  ├── Knowledge Semantic Provider
  └── future Mail/Calendar/Resource Provider
```

UI 生命周期：

```text
query id
cancellation
loading
stale response protection
incremental result
```

使用上游修复后的行为。

---

# 20. Desktop / Workbench 融合

# 20.1 两类历史保留产品入口，不复制底层文件壳

Workspace File History 与 Agent 对话文件变更历史回答不同问题，允许保留不同入口：

```text
Workspace / Workbench
  → main 的完整 timeline / deleted files / diff / restore

Agent Chat / Conversation
  → 当前对话或操作相关文件变化的过滤投影
```

两者可以复用上游的：

```text
history action
version timeline
diff viewer
restore action
deleted files
```

组件和 domain service，但 Agent 维度只能是查询上下文，不得创建第二套 physical history store、watcher 或写入事实源。也不得因为两个入口复制两套文件树产品壳。

---

# 20.2 建议交互

```text
Workbench
 ├── File Tree
 ├── Preview / Editor
 ├── Knowledge Status
 └── Workspace History (main)
      ├── Versions
      ├── Diff
      └── Restore

Agent Conversation
 └── File Changes
      ├── conversation-scoped projection
      ├── Diff
      └── open shared restore flow
```

---

# 20.3 UI 不成为状态事实源

UI 只消费：

```text
Resource Event
History API
Knowledge API
```

不能在 UI 内独立维护：

> “我认为这个文件已经更新”的 shadow state。

---

# 21. REST / Server API 设计原则

# 21.1 不接受 raw workspace root 或新 workspaceId 作为公共身份

API 绑定当前已授权的 `main` 上下文：

```text
sourceKey=main
authorized MainWorkspaceContext
ResourceRef / opaque resource key
```

API 可以：

```text
GET /workspace/history/files
```

而不是：

```text
GET /history?root=<absolute-path>
```

---

# 21.2 Restore API

概念：

```text
POST /workspace/history/restore
```

输入：

```json
{
  "resource": "...",
  "versionId": "...",
  "expectedCurrentVersion": "..."
}
```

`expectedCurrentVersion` 用于避免：

```text
用户打开历史页面
  ↓
文件后来又被修改
  ↓
旧 UI 无条件 restore
```

导致覆盖新数据。

---

# 21.3 所有敏感 action 重新校验

不能：

```text
route authorize once
  ↓
等待
  ↓
直接 write
```

应在 effect 前：

```text
root revalidation
resource scope revalidation
expected version
```

---

# 22. 安全模型

# 22.1 Root Identity 是安全事实源

禁止把：

```ts
absolutePath.startsWith(rootPath)
```

作为最终 security proof。

应使用：

```text
realpath/canonical identity
relative containment
root relation
scope token
provider policy
```

---

# 22.2 Symlink / Junction Race

重点动作：

```text
restore
transfer
materialize
write
delete
rename
```

必须在：

```text
authorization
和
effect
```

之间考虑 root replacement / link race。

---

# 22.3 FileHistory DB 必须位于用户 workspace 之外

否则会产生：

```text
history.sqlite
  ↓
watcher sees history.sqlite
  ↓
history captures history.sqlite
  ↓
self-reference
```

同时 Knowledge 也可能索引 runtime db。

必须保证：

```text
runtime data
≠
workspace user knowledge
```

---

# 22.4 Event 不泄漏绝对路径

内部可以使用 canonical local path。

外部/LAN/API 不应该默认广播绝对路径。

优先发送：

```text
sourceKey
resource reference
relative logical path
opaque resource key
```

---

# 23. 性能预算

# 23.1 Watcher 数量

硬性架构 invariant：

```text
同一 canonical local root
≤ 1 physical watcher
```

不允许 watcher 数量跟业务 consumer 线性增长。

---

# 23.2 Baseline Scan

一个 workspace infrastructure scan。

不允许：

```text
History scan
+
Knowledge scan
+
Desk scan
```

全部独立 walk filesystem。

---

# 23.3 Event Coalescing

对于高频保存：

```text
save
save
save
```

History 可以继续使用上游 merge window。

Knowledge 侧可以：

```text
coalesce same-resource stale versions
```

最终只处理最新 stable version。

---

# 23.4 Extraction

保留 upstream 输入大小保护。

Knowledge 不应绕过 extractor 的资源限制。

长文档进入 Knowledge 后的 chunking：

```text
属于 Knowledge ingestion
```

不是 extractor 无限扩大输入上限的理由。

---

# 23.5 Transfer

保留 HanaKDE 现有固定 budgets。

任何 upstream merge 不允许自动把这些限制变成：

```text
unlimited
```

---

# 24. Observability

本次重构后，文件系统问题必须能够定位。

建议指标：

```text
workspace_watcher_count
workspace_watcher_error_total
resource_event_total{origin,type}
resource_event_coalesced_total
resource_event_gap_total
workspace_reconcile_duration
workspace_reconcile_changed_count
file_history_capture_queue
file_history_capture_failed
document_extract_total{format,result}
knowledge_reindex_total{reason}
knowledge_reindex_latency
transfer_active_streams
```

---

# 24.1 Structured Log

建议每条跨模块操作至少可关联：

```text
sourceKey
rootIdentityKey
operationId
resourceKey
origin
sequence
```

不记录文件正文。

---

# 24.2 统一健康状态

物理观察与下游收敛统一使用：

```text
HEALTHY
DEGRADED
RECONCILING
FAILED
```

Watcher 出错、事件 gap、reconciliation 失败和 Knowledge 重索引滞后必须进入真实状态；允许按 Workspace/Resource scope 重试。不得把降级伪装 healthy，也不得静默丢失。UI 只需提供必要状态、错误与重试入口，不新增复杂运维界面。

---

# 25. 代码所有权矩阵

| 能力 | upstream 当前价值 | HanaKDE 当前价值 | 最终 Owner | 整合动作 |
|---|---|---|---|---|
| ResourceRef | 成熟基座 | 已扩展使用 | Resource Kernel | 以上游为基线 |
| Resource Access | 成熟 | 有额外安全测试 | Resource Kernel | 合并，保持更严格契约 |
| Root Identity | 较偏 path/root | 更强真实身份 | Resource Kernel | **保留并提升 HanaKDE** |
| read/write/stat/list | 成熟 | 已接 Knowledge | ResourceIO | upstream-first semantic merge |
| copy | 成熟 | 使用 | ResourceIO | 保留 |
| materialize | 上游能力 | 应复用 | ResourceIO | **完整吸收** |
| transfer | 无同级完整替代 | provider-neutral + budget | ResourceIO/Transfer | **完整保留 HanaKDE** |
| ResourceEventBus | 基础事件 | subscribe/catch-up 更强 | Resource Kernel | **以 HanaKDE 增强版为基线** |
| watcher | FileHistory recursive watcher | 多处二开 watcher | Workspace Infrastructure | **重构成唯一 Coordinator** |
| baseline sweep | FileHistory 成熟恢复机制 | Knowledge 有恢复逻辑 | Workspace Infrastructure | **只保留一套扫描机制** |
| Workspace identity | path hash 实用 | 现有 main lifecycle + Root Identity 更强 | MainWorkspaceRuntime / Resource Kernel | 不新增公共 ID；复用 sourceKey/ResourceRef/RootIdentity，History 私有 key |
| History DB | 完整实现 | 无需重写 | FileHistory | **上游为主** |
| Snapshot | 完整 | 不竞争 | FileHistory | 保留 |
| Diff | 完整 | 不竞争 | FileHistory | 保留 |
| Restore | 正常 write path | Knowledge 需联动 | FileHistory + ResourceIO | 事件化整合 |
| History retention | 完整 | 不竞争 | FileHistory | 保留 |
| Document extract | 上游新增 | Knowledge 可消费 | Extraction Service | **上游实现提升为公共服务** |
| Semantic IR | 非核心 | HanaKDE 核心 | Knowledge | **HanaKDE authority** |
| Source Registry | 非核心 | HanaKDE 核心 | Knowledge | 保留 |
| Knowledge Search | 基础文件搜索不同 | HanaKDE 核心 | Knowledge | 保留 |
| @ async lifecycle | 上游修复 | 有自定义 provider | Product/Search UI | 上游 lifecycle + Hana provider |
| Desk/Workbench | upstream desktop | HanaKDE 产品化 | Product Layer | 语义融合 |
| Windows/TOCTOU gates | 持续改进 | HanaKDE 更强测试 | Test/Security | 两边 contract 并集 |
| MCP lifecycle | 上游近期修复 | 仅适配 | Platform | upstream authority |
| Compaction/usage | 上游近期修复 | 非二开核心 | Agent Runtime | upstream authority |
| Build/native extract | 上游必要 | Hana branding/build | Build | upstream packaging + Hana release |
| Tests | upstream contracts | Hana二开 contracts | Validation | contract union，删除重复 implementation tests |

---

# 26. 明确删除 / 退役的重复实现

职责收敛完成后，下列类型代码不应保留。

## 26.1 Service-owned physical watcher

目标删除/退役：

```text
FileHistory-owned workspace watcher as ownership layer
Knowledge-owned root watcher
重复 Desktop full-root semantic watcher
```

注意：

Electron main 中已有 watcher 时，不应在不了解 IPC 生命周期的情况下机械删除。

正确步骤：

```text
审计其真实职责
  ↓
若是 physical root observation
  → 由 Coordinator 替换；切换前先停止旧 owner

若只是 renderer/server lifecycle bridge
  → 保留 bridge，但不重复 watch
```

---

## 26.2 Duplicate canonical path helpers

所有用于 security/identity 的自定义：

```text
normalizeRoot()
isInsideRootByPrefix()
workspacePathHashAsIdentity()
```

应收敛到：

```text
Root Identity
Resource Access Policy
```

路径格式化工具仍可存在，但不能各自成为安全事实源。

---

## 26.3 Multiple baseline filesystem walks

只保留：

```text
Workspace BaselineReconciler
```

业务 service 不再完整 walk 同一 root。

---

## 26.4 Duplicate document parsers

Knowledge 和 Office 插件不保留第二套：

```text
docx/xlsx/pptx/pdf parser
```

直接复用 DocumentExtractionService。HTML/JSON 等真实差异能力只能作为输出 adapter，不得再次拥有同格式的独立解析事实源。

---

# 27. 明确不合并的语义

下面这些看似相近，实际上必须保持独立。

## 27.1 FileHistory DB ≠ Knowledge DB

原因：

```text
retention 不同
数据模型不同
恢复语义不同
索引策略不同
生命周期不同
```

---

## 27.2 History Policy ≠ Knowledge Policy

用户可能希望：

```text
某文件有 history
但不进入 Knowledge
```

也可能未来存在：

```text
remote read-only source 进入 Knowledge
但不提供 local FileHistory
```

---

## 27.3 Materialize ≠ Transfer

前者是临时 compatibility projection。

后者是持久的跨 provider 资源搬运/复制。

---

## 27.4 Extracted Markdown ≠ User Markdown Resource

前者是 derived representation。

---

## 27.5 Search lifecycle ≠ Search backend

上游 UI fix 可以吸收。

HanaKDE Knowledge provider 不应因此被覆盖。

---

# 28. 本轮明确 Non-goals

为了控制范围，本次不做：

```text
1. 不把 FileHistory 一次性泛化到所有 remote provider。
2. 不引入 OCR runtime。
3. 不统一 FileHistory DB 与 Knowledge DB。
4. 不重写所有 Resource Provider。
5. 不为了目录漂亮大规模搬迁所有现有模块。
6. 不重新设计全部公开 Resource API。
7. 不用新 abstraction 包裹已有 abstraction 但没有第二消费者的地方。
8. 不直接追 upstream/main。
9. 不同时保留重复 watcher 作为“保险”。
10. 不降低 HanaKDE 现有 security/performance contract。
11. 不新增 Workspace relocation 或跨目录延续身份。
12. 不新增用户可见或跨功能公共 workspaceId。
13. 不为额外挂载建立 Workspace File History。
14. 不设计 legacy migration、旧 Profile 导入、兼容窗口或 migration rollback。
```

其中第 1 点尤为重要。

上游当前 File History 明确以 local workspace 为主要场景。

本轮应该先：

> 把 local FileHistory 做正确。

而不是因为 HanaKDE 有 Provider 抽象，就立即设计“所有云盘都必须支持 version history”。

未来可通过 capability：

```ts
provider.capabilities.history
```

逐步扩展。

---

# 29. 推荐代码结构

以下是目标职责结构，不要求为了路径一致一次性搬完所有文件。

```text
lib/
  resource-io/
    resource-io.ts
    resource-event-bus.ts
    resource-access-policy.ts
    root-identity.ts
    transfer.ts
    materialize-tool.ts
    ...

  workspace-runtime/
    main-workspace-runtime.ts
    workspace-watch-coordinator.ts
    workspace-reconciler.ts
    workspace-policies.ts

  file-history/
    file-history-service.ts
    history-store.ts
    text-file-policy.ts

  document-extract/
    index.ts
    anydoc-loader.ts
    types.ts
    document-extraction-service.ts

  knowledge/
    ...
```

---

# 30. 依赖方向规范

必须：

```text
Product
   ↓
Resource Services
   ↓
Resource Kernel / Workspace Infrastructure
   ↓
Providers
```

允许：

```text
Knowledge → DocumentExtractionService
History → ResourceIO
History → ResourceEventBus
Knowledge → ResourceEventBus
Workspace Runtime → RootIdentity
```

禁止：

```text
ResourceIO → Knowledge
ResourceIO → FileHistory
WorkspaceWatchCoordinator → Workbench
FileHistory → Knowledge
Knowledge → FileHistory DB
DocumentExtraction → Session UI
```

---

# 31. Engine Wiring

上游现有 FileHistory 与 Engine lifecycle 已经接得较深。

最终建议 Engine 只负责 assembly：

```text
Engine
  │
  ├── create ResourceIO
  ├── connect existing main Workspace lifecycle
  ├── create WorkspaceWatchCoordinator
  ├── create BaselineReconciler
  ├── create FileHistoryService
  ├── create DocumentExtractionService
  └── create KnowledgeService
```

然后 subscription：

```text
ResourceEventBus
   │
   ├── FileHistory subscriber
   ├── Knowledge subscriber
   └── Desktop event bridge
```

Engine 不应该继续：

```text
if resource changed:
    explicitly call fileHistory
    explicitly call knowledge
    explicitly call desk
```

否则以后每新增一个 Resource consumer 都要侵入 Engine。

---

# 32. Plugin / 系统能力未来化

本轮 Resource Kernel 也应为 HanaKDE 后续 Personal Workbench 奠定边界。

未来 Plugin 可以订阅：

```text
resource.changed
workspace.main.opened
workspace.mount.attached
workspace.reconciled
```

但 Plugin 不应该直接：

```text
创建 workspace root watcher
绕过 ResourceAccessPolicy
访问 history sqlite
修改 Knowledge index db
```

Plugin 使用 capability，不拥有系统 primitive。

---

# 33. Git Merge 总体策略

以下命令是未来实施蓝图，不构成本轮执行授权。创建 branch/tag、merge、commit、push 或删除任何 Git 对象前，必须按 SpecDev 副作用边界取得用户明确授权。

# 33.1 冻结 HanaKDE

```bash
git switch hanakde
git fetch origin --prune
git pull --ff-only origin hanakde
git status
```

working tree 必须 clean。

创建：

```bash
git tag -a \
  hanakde-pre-upstream-v0.446.6-20260809 \
  -m "HanaKDE baseline before openhanako v0.446.6 integration"
```

创建或推送 recovery tag 都必须取得显式授权；未获授权时只记录实施起点完整 SHA。

---

# 33.2 添加 upstream

```bash
git remote add upstream \
  https://github.com/liliMozi/openhanako.git

git fetch upstream --prune --tags
```

如果 remote 已存在则只 fetch。

---

# 33.3 固定 target

```bash
git rev-parse v0.446.6^{commit}
```

实施前必须确认输出为 `5f08a4f30203abb61dafac7dbb7ab92d11c23efa`。

---

# 33.4 确认 merge-base

```bash
BASE=$(git merge-base hanakde v0.446.6)

git show \
  --no-patch \
  --oneline \
  "$BASE"
```

此前仓库审计显示分叉点预期位于 2026-07-24 的上游基线附近。

**实际实施必须以本地 `git merge-base` 输出为最终事实。**

---

# 33.5 Patch equivalence

```bash
git log \
  --left-right \
  --cherry-pick \
  --oneline \
  hanakde...v0.446.6
```

```bash
git cherry \
  hanakde \
  v0.446.6
```

输出进入 merge audit。

---

# 33.6 计算真正 overlap

```bash
git diff \
  --name-only \
  "$BASE"..hanakde \
  | sort -u \
  > /tmp/hanakde-files.txt
```

```bash
git diff \
  --name-only \
  "$BASE"..v0.446.6 \
  | sort -u \
  > /tmp/upstream-files.txt
```

```bash
comm -12 \
  /tmp/hanakde-files.txt \
  /tmp/upstream-files.txt \
  > /tmp/overlap-files.txt
```

再进行目录分布：

```bash
git diff \
  --dirstat=files,0 \
  "$BASE"..hanakde
```

```bash
git diff \
  --dirstat=files,0 \
  "$BASE"..v0.446.6
```

---

# 34. Integration Branch

```bash
git switch hanakde

git switch -c \
  sync/openhanako-v0.446.6
```

启用：

```bash
git config rerere.enabled true
```

rerere 只负责复用已解决冲突。

**不代表自动结果无需 code review。**

---

# 35. Staged Merge，而不是一次性吞入全部差异提交

建议按上游架构 checkpoint 分段。

至少单独关注：

```text
v0.441.32
v0.442.0
v0.443.46
v0.443.54
v0.444.1
v0.446.6
```

在 merge-base 到 v0.441.32 之间如果还有适合的稳定 release tag，应根据本地：

```bash
git tag --sort=creatordate 'v*'
```

进一步细分。

原则：

> 一个 checkpoint 内的行为变化应该能够被人理解、测试并回滚。

---

# 36. 每个 checkpoint 的执行模式

```bash
git merge \
  --no-ff \
  --no-commit \
  <upstream-tag>
```

先处理纯 upstream base conflicts。

不要在一个 merge conflict commit 中顺便重构半个系统。

更好的提交顺序：

```text
merge(upstream): integrate openhanako <tag>

refactor(resource): consolidate root identity and event contracts

refactor(workspace): introduce shared workspace watch coordinator

refactor(history): adapt upstream file history to workspace runtime

refactor(extract): expose document extraction as shared capability

refactor(knowledge): consume resource events without private root watcher

feat(workbench): integrate file history into HanaKDE workbench

test(integration): validate history/resource/knowledge consistency
```

---

# 37. 冲突处理分类

每个 overlap file 首先分类：

```text
A. Upstream authority
B. HanaKDE authority
C. Semantic integration
D. Generated / regenerated
E. Legacy / delete
```

默认裁决是：上游正常功能、修复与优化完整吸收；只有 HanaKDE 的产品、安全、数据或开放边界合同受到真实影响时才进入 B/C。当前仓库“已经有一份代码”不是保留理由。

---

# 37.1 A — Upstream Authority

典型：

```text
MCP core
provider compatibility
usage accounting
compaction
upstream storage/runtime new-baseline changes
general session runtime
document converter packaging
Memory Dream / compaction / Markdown fixes
```

优先接受 upstream，然后适配 Hana extensions。

---

# 37.2 B — HanaKDE Authority

典型：

```text
Semantic IR
Source Registry
Knowledge-specific contracts
Speculo
SilverBullet-specific integration
HanaKDE Workbench product semantics
HanaKDE stronger transfer contract
```

保留 HanaKDE，同时适配 upstream API。

---

# 37.3 C — Semantic Integration

最重要：

```text
resource-io.ts
resource-event-bus.ts
workspace watcher
engine wiring
file-history integration
root/path identity
server restore routes
Desk/Workbench file refresh
@ search provider
```

禁止简单 ours/theirs。

---

# 37.4 D — Generated

典型：

```text
package-lock.json
generated manifests
build receipts when derived
```

先合并源配置，再重建。

---

# 37.5 E — Legacy / Delete

如果功能已经迁入统一 infrastructure：

```text
old Knowledge root watcher
FileHistory private watcher ownership
duplicate path helper
duplicate baseline scan
```

应删除，不为了“来源可追踪”继续运行。

Git history 已经提供来源追踪。

---

# 38. Package / Lockfile

`package.json`：

```text
manual semantic union
```

尤其注意 upstream Document Extract 新 native/runtime dependency。

`package-lock.json`：

```text
不得 checkout --ours
不得 checkout --theirs
```

正确流程：

```text
先解决 package.json
  ↓
按仓库 npm/version policy 重建 lock
  ↓
npm ci
```

必须验证 clean environment 可安装。

---

# 39. Build / Native Dependency

Document Extract 可能引入 native converter / packaged asset。

必须验证：

```text
development
production build
Electron packaging
Windows
macOS
CI
auto-update package
```

Windows 与 macOS 是本 umbrella change 的阻断平台。Linux 可以运行非阻断检查并记录结果，但 Linux 失败不阻止本 change 完成，也不得替代两个阻断平台的原生证据。

不能只验证：

```text
node unit test
```

---

# 40. 未发布产品的新基线

HanaKDE 当前尚未发布，本轮是颠覆性基线更新，因此直接采用最终 schema 和最终基础设施：

```text
no existing-profile migration
no upstream-profile import
no legacy path-hash discovery
no migration marker
no compatibility window
no migration rollback
```

需要验证的是新基线本身：

```text
main 打开时 Root Identity 正确
File History 新库可初始化
Knowledge/History 新状态可从当前文件事实建立
初始化失败进入 FAILED 并可 scoped retry
普通 Workspace 文件能力不因 History 初始化失败而被破坏
```

Root Identity 可疑时继续 fail closed。这是正常运行时安全合同，不是旧数据升级流程。

---

# 41. 单 owner 切换与恢复

基础设施切换不允许临时双运行：

```text
在隔离环境验证新 owner
  ↓
停止旧 owner并证明已释放 watcher/mutation/baseline ownership
  ↓
启动新 owner
  ↓
验证 HEALTHY / 必要时 RECONCILING
```

如果新 owner 无法工作：

```text
停止新 owner
  ↓
确认其 watcher / queue / baseline 已关闭
  ↓
恢复前一代码 Wave 的 owner
```

这只是可审计的代码 Wave 恢复，不是数据迁移回滚。禁止双 watcher、双 mutation、双 baseline walk、自动破坏性重建或为了回退保留第二套长期实现。

---

# 42. 测试策略：Contract Union，而不是 Test File Union

两边测试不能简单全部永远保留。

正确原则：

> 保留所有重要行为契约，但删除只验证旧实现细节的重复测试。

---

# 42.1 必须保留的测试

涉及：

```text
security
permissions
Resource contracts
external protocols
native dependencies
build
cross-platform
Knowledge semantic contracts
TOCTOU
Windows
transfer budget
history correctness
```

---

# 42.2 可以删除/合并的测试

如果两个测试只是在分别验证：

```text
Watcher A 调了 callback
Watcher B 调了 callback
```

而架构已经只有一个 Coordinator，

则应重写为：

```text
一个 Coordinator contract test
+
consumer integration tests
```

不是保留两套旧实现测试。

---

# 43. Resource Kernel Unit Tests

必须覆盖：

```text
Root Identity:
- same
- ancestor
- descendant
- disjoint
- unknown
- Windows case differences
- realpath
- inode unavailable
- junction/symlink

ResourceEventBus:
- subscribe/unsubscribe
- ordered sequence
- changed dedup
- since()
- stale
- subscriber failure isolation

Transfer:
- fixed limits
- cross-provider
- version conflict
- atomic target
- source revalidation
- cancellation/recovery
```

---

# 44. WorkspaceWatchCoordinator Tests

必须：

```text
same root + N consumers
=> 1 physical watcher

two different roots
=> 2 physical watchers

consumer unsubscribe
=> watcher kept until last consumer

last consumer detach
=> watcher closed

symlink directory
=> not followed by default

external create/modify/delete/rename
=> normalized observations

watcher failure
=> degraded + reconcile

event gap / retry success / retry failure
=> DEGRADED / RECONCILING / HEALTHY or FAILED

owner cutover
=> old owner stopped before new owner starts; overlap count always 0
```

---

# 45. Descriptor Regression Test

针对上游真实修复过的问题建立永久回归测试。

不一定在 CI 真创建 20,000 OS watcher。

更稳定的方法：

```text
synthetic 50k file tree
  ↓
attach workspace
  ↓
assert physical watcher factory called O(roots)
not O(files)
```

并可在平台专项测试做真实 descriptor smoke test。

---

# 46. FileHistory Tests

覆盖：

```text
capture
same-version no duplicate
merge window
deleted history
rename
rename within main
move from main to mount => main delete history only
retention
quota
diff
restore
restore creates recoverable history
external watcher capture
reconciliation capture
new-store initialization failure + scoped retry
```

---

# 47. Document Extraction Tests

覆盖：

```text
DOCX
XLSX
PPTX
PDF text layer
CSV
EPUB/RTF where fixtures available

too-large
unsupported
scanned-pdf
parse-failed

remote resource via materialize/read
authorization denied
staging cleanup
extractor version cache invalidation
```

---

# 48. Knowledge Integration Tests

最重要的统一一致性场景：

## 48.1 Create

```text
create foo.md
  ↓
History exists
Knowledge indexed
Tree visible
Search finds
```

## 48.2 Modify

```text
A → B
```

验证：

```text
History contains versions
Knowledge = B
Search = B
```

## 48.3 External Modify

用 OS-level external write：

```text
VS Code equivalent
```

验证同样结果。

## 48.4 Restore

```text
B → restore A
```

验证：

```text
disk = A
preview = A
history current = A
knowledge = A
search = A
agent read = A
```

## 48.5 Rename

验证：

```text
tree
history
source registry
search
references
```

## 48.6 Delete

验证：

```text
file absent
history preserved according to policy
knowledge removed/tombstoned
search invalid
```

---

# 49. Office Knowledge E2E

新增：

```text
report.docx
   ↓
workspace
   ↓
extract
   ↓
Knowledge IR
   ↓
search
```

修改 Word 后：

```text
resource version changes
  ↓
cache invalid
  ↓
re-extract
  ↓
re-index
```

---

# 50. Reconciliation Tests

模拟：

```text
drop watcher event
```

然后：

```text
run reconcile
```

最终：

```text
History correct
Knowledge correct
UI model correct
```

这验证：

> watcher 不是唯一真相来源。

---

# 51. Windows 专项门禁

Windows 必须是 blocking platform。

测试：

```text
case-insensitive path
junction
symlink where permitted
root replacement
locked file
rename burst
temporary file save pattern
staged upload
resource transfer
Electron startup/teardown
watcher close
restore
```

---

# 52. macOS 专项门禁

重点：

```text
recursive watcher
descriptor count
rapid filesystem changes
app sleep/resume
event loss + reconciliation
case-insensitive filesystem
symlink
native extractor packaging
```

---

# 53. Linux 非阻断验证

重点：

```text
case-sensitive roots
inotify behavior
symlink
descriptor cleanup
native extractor
permissions
```

Linux 结果作为附加风险证据记录，不属于本 umbrella change 的完成阻断门。

---

# 54. Security E2E

至少：

```text
authorize root
  ↓
replace root before restore
  ↓
restore must fail closed
```

```text
authorize source
  ↓
replace symlink during transfer
  ↓
transfer must fail/revalidate
```

```text
history route references resource outside workspace
  ↓
deny
```

```text
extract path outside authorized root
  ↓
deny before native converter
```

---

# 55. Performance Acceptance

建立以下趋势要求：

```text
watcher count ~ O(workspace roots)
not O(files × consumers)

baseline walk = 1 logical scan
not N services × scan

same-resource rapid changes
=> bounded queue / coalescing

Knowledge rebuild
=> only stale sources

Document extract
=> bounded input

Transfer
=> fixed process budget
```

---

# 56. 最终基础命令门禁

以当前仓库实际 scripts 为准，至少：

```bash
npm ci
npm test
npm run typecheck
npm run lint
```

再运行仓库已有：

```text
Knowledge E2E
Windows gates
macOS gates
Electron/build tests
production package validation
```

不要在文档里虚构一个并不存在的 npm script。

---

# 57. Integration 实施阶段

# Phase 0 — Freeze & Audit

产物：

```text
backup tag
merge-base report
patch-equivalence report
overlap-files report
module ownership report
```

不改变行为。

---

# Phase 1 — Upstream Base Refresh

先吸收低冲突/基座能力：

```text
session
storage
provider
MCP
compaction
usage accounting
Memory Dream
Markdown bare URL / editor fixes
general security fixes
build changes
```

目标：

> HanaKDE 先站到新的 upstream runtime 上。

---

# Phase 2 — Resource Kernel Consolidation

重点：

```text
ResourceIO
ResourceEventBus
RootIdentity
Materialize
Transfer
AccessPolicy
```

结果：

```text
唯一 Resource Kernel
```

此阶段不急着做 FileHistory UI。

---

# Phase 3 — Workspace Infrastructure

演进并收敛现有基础设施：

```text
existing main Workspace lifecycle
WorkspaceWatchCoordinator
BaselineReconciler
WorkspacePolicies
```

将现有 watcher 职责逐个收敛到单 owner。

新 coordinator 生效前，旧 watcher 必须先关闭并证明已释放 ownership；失败回退也必须先停止新 owner。

**任何阶段都不允许同一真实 root 临时双 watcher、双 mutation 或双 baseline walk。** 新路径只能先在不接入同一真实 root 的隔离测试中验证。

---

# Phase 4 — FileHistory Integration

吸收：

```text
HistoryStore
FileHistoryService
Capture Policy
Diff
Restore
Retention
API
UI semantics
```

Workspace File History 只覆盖 `main`。Workspace/Workbench 与 Agent Conversation 保留各自历史入口，但共享 History service、组件与底层 primitive。

替换：

```text
private watcher
public path-hash authority
private baseline ownership
```

---

# Phase 5 — Document Extraction

吸收上游 extractor。

先保证 File Tool 行为保持上游兼容。

再提升：

```text
DocumentExtractionService
```

供 Knowledge 使用。

---

# Phase 6 — Knowledge Event Convergence

移除 Knowledge 对同 root 的原始物理 watcher。

改：

```text
ResourceEventBus subscriber
+
reconciliation consumer
```

补充：

```text
source version
extraction version
```

---

# Phase 7 — Workbench / Chat / Desktop Integration

融合：

```text
History panel
Diff
Restore
Deleted files
Knowledge state
@ mention lifecycle
```

保留 Workspace History 与 Agent 对话文件变化两个产品入口；只删除重复文件产品壳和底层事实源。

---

# Phase 8 — New-baseline Initialization & Failure

处理：

```text
main lifecycle initialization
File History new-store initialization
HEALTHY / DEGRADED / RECONCILING / FAILED transitions
Root Identity fail-closed behavior
scoped retry
```

不实现 legacy migration、旧 Profile 导入、兼容窗口或 migration rollback。

---

# Phase 9 — Hardening

执行：

```text
cross-platform
security
descriptor regression
large workspace
native build
restore consistency
```

其中 Windows/macOS 为阻断门，Linux 只提供非阻断附加证据。

---

# Phase 10 — Documentation / ADR

提交：

```text
architecture docs
sync ledger
troubleshooting
ADR
```

---

# 58. 建议 ADR

## ADR-001 Resource Kernel Ownership

决定：

> Resource identity、access、mutation、event 是 platform primitive。

---

## ADR-002 Main Workspace Identity

决定：

> 工作目录就是唯一 `main`；不新增公共 workspaceId 或 relocation，复用 sourceKey、ResourceRef 与 Root Identity，File History 仅有私有 storage key。

---

## ADR-003 Single Physical Workspace Observation

决定：

> 同一 canonical root 不因 consumer 数量增加物理 watcher；切换和恢复执行 stop-then-start，不允许临时双运行。

---

## ADR-004 Physical History vs Semantic State

决定：

> Workspace History、Agent 对话文件变化与 Knowledge 共享 Resource/Event/Version primitive；两个 History 入口保留不同 scope，History 与 Knowledge 不共享 persistence。

---

## ADR-005 Document Extraction Is Derived Content

决定：

> Extracted Markdown 默认不自动成为用户 Resource。

---

## ADR-006 Copy / Transfer / Materialize

决定三种能力生命周期严格分离。

---

## ADR-007 Upstream Integration Policy

决定：

```text
upstream platform fixes 默认吸收
Hana product semantics 保留
shared primitive 做语义融合
duplicate infrastructure 删除
```

## ADR-008 Unreleased New Baseline

决定：

> HanaKDE 尚未发布，本 change 不设计 legacy migration、旧 Profile 导入、兼容窗口或 migration rollback。

## ADR-009 Blocking Platforms

决定：

> Windows 与 macOS 是完成阻断平台；Linux 验证非阻断。

---

# 59. 推荐提交序列

建议可审计提交：

```text
chore(sync): freeze HanaKDE baseline before openhanako v0.446.6

merge(upstream): integrate platform updates through selected checkpoint

refactor(resource): consolidate resource identity and event contracts

refactor(workspace): introduce shared workspace runtime

refactor(workspace): consolidate recursive watch ownership

refactor(history): integrate upstream file history with workspace runtime

refactor(history): establish private main history storage key

refactor(extract): expose upstream document extraction as shared service

refactor(knowledge): consume unified resource events

feat(knowledge): ingest supported office documents through extraction service

feat(workbench): integrate file history and restore experience

fix(search): preserve upstream async workspace mention lifecycle

test(resource): cover watcher dedup and reconciliation

test(integration): cover file history and knowledge consistency

test(security): preserve root identity and TOCTOU guarantees

docs(architecture): document resource and workspace consolidation

docs(sync): record openhanako v0.446.6 integration
```

实际 merge commit 可以穿插其中，关键是：

> 不要最后只剩一个无法审计的 “merge upstream”。

---

# 60. 禁止的 Git 操作

不得：

```bash
git merge -X ours upstream/main
```

不得：

```bash
git merge -X theirs upstream/main
```

不得大规模：

```bash
git cherry-pick <275 commits>
```

不得：

```bash
git rebase v0.446.6
```

重放 HanaKDE 长期公开二开历史。

---

# 61. 最终 Git 验收

最终 branch：

```bash
git merge-base --is-ancestor \
  v0.446.6 \
  HEAD
```

必须成功。

这证明：

> 上游 target 真正成为 HanaKDE ancestry，而不是只 cherry-pick 了一堆代码。

---

# 62. 架构验收 Invariants

以下任何一项失败，都不能 merge 到 `hanakde`。

## Resource

```text
Root Identity 不降级
Transfer contract 不降级
Materialize 可用
Resource access 不越权
```

## Workspace

```text
同 canonical root 一个 physical watcher
watcher 失败可 reconcile
symlink/junction 不逃逸
```

## History

```text
capture/diff/restore 完整
restore 可逆
retention 正确
deleted history 正确
```

## Knowledge

```text
Semantic IR 保留
Source Registry 保留
Search 保留
restore 后 semantic state 自动一致
Office document 可进入 Knowledge
```

## UI

```text
Workspace/Workbench History (`main`) 可达
Agent Conversation File Changes 可达
两类入口共享 History primitive
@ file search 生命周期正确
不出现两套互相竞争文件树
```

## Platform

```text
Windows gates
macOS watcher regression
native extraction packaging
production build
```

---

# 63. “代码量不增加”的真实衡量方式

整合完成后，不以：

```text
总 LOC 必须下降
```

作为唯一标准。

因为新 FileHistory / Extract 是真实新功能，本身必然增加一些代码。

应该衡量：

```text
duplicate watcher implementation count ↓
duplicate path-security helper count ↓
duplicate baseline scan count ↓
duplicate document parser count ↓
engine hard-coded consumer wiring ↓
business layer filesystem ownership ↓
```

同时：

```text
capabilities ↑
contract tests ↑
cross-module consistency ↑
future merge cost ↓
```

这才是健康的架构收敛。

---

# 64. 后续 Upstream Sync 模式

完成本轮后，未来每次 sync 应按模块归属自动分类。

上游新增：

```text
Agent runtime / MCP / provider / base storage
```

→ 默认 upstream-first。

上游新增：

```text
Resource primitive
```

→ 检查是否进入 Resource Kernel。

上游新增：

```text
Workspace file feature
```

→ 接 Workspace Runtime，不允许自己创建第二 watcher。

上游新增：

```text
Document parser
```

→ 接 DocumentExtractionService。

上游新增：

```text
Product UI
```

→ 判断是否融入 Hana Workbench，而不是复制一套产品壳。

---

# 65. Upstream Sync Ledger

建议新增：

```text
docs/
  maintenance/
    upstream-sync/
      README.md
      2026-08-09-openhanako-v0.446.6.md
```

记录：

```yaml
upstream:
  repo: liliMozi/openhanako
  target: v0.446.6
  commit: 5f08a4f30203abb61dafac7dbb7ab92d11c23efa

downstream:
  repo: NAMEWTA/HanaKDE
  branch: hanakde

integration:
  strategy: staged-merge
  resource_kernel_consolidation: true
  single_workspace_watcher: true
  main_only_workspace_history: true
  public_workspace_id: false
  legacy_migration: false
  blocking_platforms: [windows, macos]

preserved_hanakde:
  - root-identity
  - provider-neutral-transfer
  - resource-event-subscription
  - semantic-ir
  - source-registry
  - knowledge-search
  - workbench
  - windows-security-gates

absorbed_upstream:
  - file-history
  - recursive-workspace-watch-design
  - baseline-reconciliation
  - document-extract
  - materialize
  - mcp-lifecycle-fixes
  - workspace-mention-search-fix
  - compaction
  - provider-usage-accounting
  - memory-dream
  - compaction-menu-fix
  - markdown-bare-url-fix

removed_duplicates:
  - service-owned-duplicate-watchers
  - duplicate-root-identity-logic
  - duplicate-baseline-scans
  - duplicate-document-parsers
```

---

# 66. Definition of Done

本轮只有同时满足以下条件才算完成：

```text
1. v0.446.6（`5f08a4f30203abb61dafac7dbb7ab92d11c23efa`）是最终 hanakde 的 Git ancestor。
2. HanaKDE Knowledge / Resource / Workbench 二开能力无回退。
3. 上游 FileHistory 在 `main` 范围完整可用，Agent 对话文件变化可由共享底层投影。
4. 上游 Document Extract 完整可用。
5. Office 文档可以通过统一 Extraction Service 进入 Knowledge。
6. Materialize 与 Transfer 同时存在且语义清晰。
7. Root Identity 成为统一 physical root authority。
8. 同一 workspace root 不存在多个业务模块各自持有的 physical watcher。
9. ResourceEventBus 成为统一 mutation fan-out。
10. Baseline reconciliation 不重复完整扫描同一 root。
11. Restore 后 Disk / Preview / History / Knowledge / Agent Read 一致。
12. Windows/macOS 关键门禁通过。
13. Package/native build 可生产打包。
14. 重复基础设施和重叠 document parser 被删除，而非永久并列。
15. 架构和 upstream sync ledger 已进入仓库。
```

---

# 67. 最终推荐架构图

```text
                               ┌──────────────────────────────┐
                               │       HanaKDE Product       │
                               │                              │
                               │ Workbench / Desk / @Mention │
                               │ Workspace History (main)    │
                               │ Agent File Changes / Knowledge UI │
                               └──────────────┬───────────────┘
                                              │
                                              ▼
                  ┌─────────────────────────────────────────────────┐
                  │                 Resource Services               │
                  │                                                 │
                  │  FileHistoryService     KnowledgeIndexService  │
                  │  DocumentExtraction     TransferService        │
                  └───────────────┬─────────────────────────────────┘
                                  │
                                  ▼
      ┌────────────────────────────────────────────────────────────────────┐
      │                         Resource Kernel                            │
      │                                                                    │
      │ ResourceRef                                                        │
      │ Provider Resolution                                                │
      │ ResourceAccessPolicy                                               │
      │ ProviderRootIdentityBroker                                         │
      │ read/write/stat/list/copy                                          │
      │ materialize                                                        │
      │ transfer                                                           │
      │ Resource Version                                                   │
      │ ResourceEventBus                                                   │
      └───────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
      ┌────────────────────────────────────────────────────────────────────┐
      │                      Workspace Infrastructure                      │
      │                                                                    │
      │ Existing main Workspace lifecycle                                 │
      │ MainWorkspaceRuntime / sourceKey=main                             │
      │ ResourceRef / RootIdentity / private historyStoreKey              │
      │ WorkspaceWatchCoordinator  ← one physical observer per root       │
      │ BaselineReconciler                                                 │
      │ Watch / History / Knowledge / Visibility Policies                 │
      └───────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │     Resource Provider    │
                         │                         │
                         │ Local / Mount / Remote  │
                         └─────────────────────────┘
```

事件闭环：

```text
                     INTERNAL WRITE
                          │
                          ▼
                      ResourceIO
                          │
                          │ authoritative mutation
                          ▼
                   ResourceEventBus
                          │
             ┌────────────┼─────────────┐
             ▼            ▼             ▼
         History       Knowledge        UI


EXTERNAL WRITE
     │
     ▼
 filesystem
     │
     ▼
WorkspaceWatchCoordinator
     │
 normalized observation
     ▼
ResourceEventBus
     │
 ┌───┴───────────┐
 ▼               ▼
History       Knowledge


MISSED EVENT
     │
     ▼
BaselineReconciler
     │
     ▼
ResourceEventBus
     │
 ┌───┴───────────┐
 ▼               ▼
History       Knowledge
```

Restore：

```text
History Snapshot
      │
      ▼
Restore Handler
      │
  revalidate
      │
      ▼
ResourceIO.write
 origin=history_restore
      │
      ▼
ResourceEventBus
      │
 ┌────┼──────────────┐
 ▼    ▼              ▼
History Knowledge    UI
      │
      ▼
 semantic state
 re-converges
```

Office：

```text
DOCX/PDF/XLSX/PPTX
        │
        ▼
      Resource
        │
        ▼
DocumentExtractionService
        │
        ▼
 Derived Markdown
      /        \
     ▼          ▼
Agent Tool   Knowledge IR
```

---

# 68. 最终技术判断

本轮整合最错误的目标是：

> “怎样把冲突文件全部留下？”

最正确的目标是：

> “怎样把双方真实能力全部转化成一套没有重复事实源的系统？”

因此最终取舍应该非常明确：

### 保留上游成熟功能

```text
File History
History Store
Diff / Restore
Recursive watcher 经验
Baseline recovery
Document Extract
Materialize
MCP / runtime / provider fixes
@ mention lifecycle fix
Memory Dream / compaction / Markdown fixes
```

### 保留并提升 HanaKDE 的更强基础能力

```text
Root Identity
Provider-neutral Transfer
Resource Event internal subscriptions
Knowledge Semantic IR
Source Registry
Knowledge Search
Workbench
Windows / TOCTOU hardening
```

### 删除双方重复职责

```text
多个 physical watcher
多个 baseline scan
多个 path/root identity authority
多个 document parser
Engine 中对消费者的硬编码 fan-out
重复文件树产品壳
```

### 明确保留独立语义

```text
Physical History ≠ Semantic State
Materialize ≠ Transfer
History Policy ≠ Knowledge Policy
Derived Markdown ≠ User Resource
Search Lifecycle ≠ Search Backend
Workspace History Scope ≠ Agent Conversation Scope
```

最终 HanaKDE 得到的不是：

```text
openhanako
+
HanaKDE patches
```

而是：

```text
openhanako mature platform evolution
           │
           ▼
HanaKDE Resource / Workspace Kernel
           │
   ┌───────┼─────────┐
   ▼       ▼         ▼
History  Knowledge  Extraction
   │       │         │
   └───────┼─────────┘
           ▼
   Personal Workbench
```

这是一次 **Fork Sync**，但同时也是一次 **Architecture Consolidation**。

本轮完成后，HanaKDE 应正式从：

> “在 openhanako 上持续修改文件/知识能力的 fork”

演进为：

> **“以 openhanako 为稳定 Agent/runtime 基座，以统一 Resource Kernel 和 Workspace Infrastructure 承载 HanaKDE Personal Workbench 能力的长期二开平台。”**

这才是能够持续同步上游，同时继续扩大 HanaKDE 产品能力的结构。

---

# 69. 参考依据

> 说明：本方案的 merge 输入固定为 `v0.446.6` / `5f08a4f30203abb61dafac7dbb7ab92d11c23efa`。原 `v0.444.1` 蓝图继续作为 Resource/History/Extraction 设计来源，并已审计 `v0.444.1..v0.446.6` 的 Memory Dream、compaction 与 Markdown 增量。真正实施时必须以冻结 tag 内容为准，不把随后 `main` 的变化无意带入本次 merge。

## Upstream

- Releases  
  https://github.com/liliMozi/openhanako/releases

- Release digest  
  https://github.com/liliMozi/openhanako/blob/main/release-digest.v2.json

- File History  
  https://github.com/liliMozi/openhanako/tree/main/lib/file-history

- FileHistoryService  
  https://github.com/liliMozi/openhanako/blob/main/lib/file-history/file-history-service.ts

- Workspace watcher  
  https://github.com/liliMozi/openhanako/blob/main/lib/file-history/workspace-watcher.ts

- Document Extract  
  https://github.com/liliMozi/openhanako/tree/main/lib/document-extract

- Document Extract implementation  
  https://github.com/liliMozi/openhanako/blob/main/lib/document-extract/index.ts

## HanaKDE

- Repository  
  https://github.com/NAMEWTA/HanaKDE

- ResourceIO  
  https://github.com/NAMEWTA/HanaKDE/tree/hanakde/lib/resource-io

- Root Identity  
  https://github.com/NAMEWTA/HanaKDE/blob/hanakde/lib/resource-io/root-identity.ts

- Transfer  
  https://github.com/NAMEWTA/HanaKDE/blob/hanakde/lib/resource-io/transfer.ts

- Resource Event Bus  
  https://github.com/NAMEWTA/HanaKDE/blob/hanakde/lib/resource-io/resource-event-bus.ts

## Cross-fork comparison

- HanaKDE → upstream comparison  
  https://github.com/NAMEWTA/HanaKDE/compare/hanakde...liliMozi%3Aopenhanako%3Amain

- upstream → HanaKDE comparison  
  https://github.com/liliMozi/openhanako/compare/main...NAMEWTA%3AHanaKDE%3Ahanakde

---

# Appendix A — Code Review Checklist

```text
[ ] 是否新建了另一个 physical workspace watcher？
[ ] 是否引入了另一个 path-as-security-authority？
[ ] 是否绕过 ResourceAccessPolicy？
[ ] 是否绕过 RootIdentity revalidation？
[ ] 是否直接修改 Knowledge DB 来响应 restore？
[ ] 是否直接访问 FileHistory SQLite？
[ ] 是否复制了一份 Office parser？
[ ] 是否把 materialize 当 transfer？
[ ] 是否用同一个 ignoredPaths 控制 history/knowledge/UI？
[ ] 是否在 Engine 中硬编码新 consumer？
[ ] 是否让 watcher event 与 ResourceIO event 重复产生业务 mutation？
[ ] 是否让 generated/extracted Markdown 自动污染用户 workspace？
[ ] 是否降低 transfer budget？
[ ] 是否让 native extraction 绕过授权？
[ ] 是否破坏 Windows junction/case semantics？
[ ] 是否添加了行为测试而非只添加 implementation test？
[ ] 是否让额外挂载进入了 Workspace File History？
[ ] 是否引入了公共 workspaceId 或 relocation？
[ ] 是否让 Workspace/Agent 两类历史拥有重复 watcher/store/restore 通道？
[ ] 是否删除了收敛完成后的重复实现？
```

---

# Appendix B — PR Template 建议

```markdown
## Upstream target

- Tag:
- Commit:
- Merge base:

## Scope

- [ ] Upstream base
- [ ] Resource Kernel
- [ ] Workspace Runtime
- [ ] File History
- [ ] Document Extraction
- [ ] Knowledge
- [ ] Workbench/Desktop
- [ ] New-baseline initialization / health states
- [ ] Platform validation

## Architecture invariants

- [ ] No duplicate physical watcher per canonical root
- [ ] Root Identity remains authority
- [ ] FileHistory and Knowledge keep separate persistence
- [ ] Restore flows through ResourceIO
- [ ] ResourceEventBus drives consumers
- [ ] Transfer safety budgets unchanged
- [ ] Extracted Markdown remains derived unless explicitly imported

## Validation

- [ ] npm ci
- [ ] npm test
- [ ] npm run typecheck
- [ ] npm run lint
- [ ] Knowledge E2E
- [ ] Windows gates
- [ ] macOS watcher regression
- [ ] production build/package
- [ ] single-owner stop-then-start cutover
- [ ] DEGRADED / RECONCILING / FAILED recovery

## Removed duplicate infrastructure

Describe exactly what old watcher/path/sweep/parser code was deleted.

## Deferred work

List intentional non-goals. Do not hide them as TODOs inside merge conflict resolutions.
```

---

# Appendix C — 最终一句话原则

> **HanaKDE 对 openhanako 的整合，应当吸收所有有价值的上游行为，却只保留一套底层事实源：功能做并集，Primitive 做收敛；以更严格的安全契约和更清晰的层次边界替代简单 ours/theirs，从而让 File History、Document Extraction、ResourceIO、Transfer 与 Knowledge Workspace 成为同一 Resource Platform 上彼此互补的能力。**
