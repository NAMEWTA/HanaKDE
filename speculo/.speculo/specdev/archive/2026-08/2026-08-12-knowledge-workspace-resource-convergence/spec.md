---
schema_version: 3
artifact: spec
change: 2026-08-12-knowledge-workspace-resource-convergence
status: ready
ready_for_tickets: true
sources:
  - USER-DECISION:2026-08-12-knowledge-resource-convergence
  - <Path>{roots.state}/specdev/changes/2026-08-12-knowledge-workspace-resource-convergence/diagnosis.md</Path>
  - <Path>{roots.state}/specdev/changes/2026-08-12-knowledge-workspace-resource-convergence/design-tree.json</Path>
  - <Path>{roots.state}/specdev/changes/2026-08-12-knowledge-workspace-resource-convergence/ADR.md</Path>
  - <Path>{roots.state}/specdev/changes/2026-08-12-knowledge-workspace-resource-convergence/CONTEXT.md</Path>
  - <Path>docs/upstream-sync-ledger.md</Path>
---

# Spec: Knowledge 工作区资源内核与文件树交互收敛

- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-12-knowledge-workspace-resource-convergence/spec.md</Path>`
- **当前 ADR：** `<Path>{roots.state}/specdev/changes/2026-08-12-knowledge-workspace-resource-convergence/ADR.md</Path>`
- **当前领域上下文：** `<Path>{roots.state}/specdev/changes/2026-08-12-knowledge-workspace-resource-convergence/CONTEXT.md</Path>`

## 1. 问题与目标

### 问题陈述

Knowledge 将聊天/工作台当前选择的目录解析为 `main`，但公开 ResourceIO 与 Knowledge registry、复合 operation coordinator 可能由不同 owner 初始化。于是同一个 `KnowledgeResourceAddress` 能列出资源，却在保存、新建、删除或导入时得到 `knowledge_resource_unavailable`（503）。资源树还没有工作台已有的文件右键操作，创建成功后的 dialog 在异步窗口内仍可再次提交，造成重复请求和 409 冲突。

当前 fork 还必须持续接收上游 checkpoint。修复若复制上游实现、重建第二套文件语义或大范围移动代码，会增加后续路径冲突和语义漂移，破坏本地已经锁定的 ResourceIO、观察 owner、Trash、Native Grant 与安全边界。

### 目标用户与场景

- 使用聊天/工作台打开一个工作目录后，在 Knowledge 中编辑 Markdown 并保存的用户。
- 在 Knowledge 资源树中创建页面/文件夹、删除、复制、同源剪切粘贴和重命名的用户。
- 需要预览 PDF、图片、HTML/代码等资源，或在有原生授权时用默认应用打开的用户。
- 维护 fork 并按 upstream ledger 逐 checkpoint 升级的维护者。

### 成功标准

- 活动工作目录、Knowledge `main` 和公开 ResourceIO 使用同一可观察 owner；保存、创建、删除/恢复和 paste 不再因为 owner 分裂产生 503。
- 创建成功后 dialog 已卸载且一次提交最多产生一个 mutation；失败保留输入并允许显式重试。
- 资源树右键菜单与工作台动作一致，并按资源、来源和运行环境能力投影；不可用的原生动作不显示或不宣称成功。
- 同源 cut/paste 是一次可恢复的 move，跨来源 cut fail closed，copy 保持源不变且不重写链接。
- 上游升级仍可按现有五路分类、owner 审计、受影响测试和 ledger checkpoint 合并本地修复；不引入第二 owner 或重复基础设施。

### 非目标

- 不创建第二套 Knowledge 文件存储、ResourceIO、watcher、Trash、parser、preview 或 clipboard 语义。
- 不改变 agent 会话授权目录模型，也不把授权目录登记为 Knowledge 挂载目录。
- 不改变 `KnowledgeResourceAddress` 的 `{sourceKey, relativePath}` DTO，不把绝对路径、public workspace id 或 raw path 暴露给 Renderer/Server 合同。
- 不引入跨来源移动、自动链接重写、永久删除旁路或非 Markdown 页面伪装。
- 不在本 change 内完成 upstream 合并、rebase、提交、推送或发布；只规定本地修复必须可被后续 checkpoint 遍历升级保留。

## 2. 解决方案与外部行为

### 解决方案摘要

以活动工作根为 `main` 的唯一 owner，令 Knowledge registry、公开 ResourceIO 路由、create/copy/trash/atomic/refactor coordinator、watcher 和 index binding 消费同一个 workspace-scoped ResourceIO facade。工作根切换时旧 owner 先停止并失效，再建立新 owner 与对应 registry/operation 生命周期；任何尚未可用的阶段均保持 fail-closed 的 retryable unavailable。

Knowledge 文件树只增加到既有 Workbench 文件能力的适配：复用 Desk ContextMenu/动作、`file-kind`、`remote-file-preview`、ResourceIO operation client、Knowledge native grant 和已有 clipboard slice。Knowledge 只负责把 source-relative address 适配为现有 FileRef/preview 输入，不另建文件类型解析器或 Node FS 旁路。

### 主要流程

#### 活动工作根和资源操作

1. 聊天/工作台选择工作目录时，该目录成为 Knowledge 展示语义中的“工作目录”和协议中的 `main`。
2. Knowledge 列表、读写、创建、paste、delete/restore 和事件刷新从同一 workspace-scoped owner 解析资源。
3. 编辑器保存继续使用现有 expected-version 写入；版本匹配时磁盘内容更新并产生既有事件/索引投影，版本不匹配继续走既有冲突处理。
4. create、paste 和 plan/commit 操作沿用现有服务、journal、Trash 和 ResourceIO contract，不改变请求地址格式或 operation identity。
5. 工作根切换或关闭时，旧 owner 不再接受新 mutation；新 owner 完成 scope 建立后资源树和编辑器刷新到新 `main`。

#### 资源树和打开

1. 用户右键单个文件或文件夹时，菜单按当前选择集和 capability 提供剪切、复制、删除、重命名、复制相对路径、复制绝对路径、打开文件夹和默认应用打开等动作。
2. 菜单动作调用已有 Knowledge client/coordinator/native bridge；Renderer 不直接访问本机文件系统。
3. `.md/.markdown` 继续打开 Knowledge Markdown editor；PDF、图片、HTML/代码及其它资产按既有 file-kind 与 remote preview 选择 renderer preview 或 file-info fallback。
4. 仅当 NativeResourceGrant 和当前 runtime 同时支持时，才显示默认应用打开、Finder/reveal 和绝对路径复制；Web/远程挂载隐藏这些动作。
5. 菜单采用 icon-first；每项有 tooltip 或 ARIA accessible name，陌生或高风险命令保留短文字 label。

#### 剪切、复制和粘贴

1. 剪贴板 payload 保留 workspace/source scope 与 source-relative addresses。
2. 同一 `sourceKey` 的 cut/paste 进入既有原子 move；成功后源地址消失、目标地址出现，事件和树定位只投影一次。
3. 来源不同的 cut 在提交前 fail closed，源保持不变，并向用户提示改用 copy；不得静默降级为 copy 或 move。
4. 跨来源 copy 在目标来源创建普通副本，源保持不变，正文/字节和链接文本不改写。
5. 无效 scope、混合来源选择、目标冲突、版本冲突或 owner 不可用时不产生部分写入；沿用现有结构化错误和 retryability。

#### 创建 dialog

1. 第一次 submit 立即进入不可重入状态，按钮和等价键盘提交不能产生第二个请求。
2. 成功 continuation 先关闭/卸载 dialog，再对 canonical address 执行一次资源树 locate；页面创建再执行一次 editor open/focus 投影。
3. 失败（包括 409 conflict 或 503 unavailable）只显示一次稳定错误，保留用户输入；用户显式重试前不得自动重复 mutation。
4. 取消、切换来源或 workspace 时清理当前 dialog 生命周期，不恢复已成功请求的交互状态。

### 边界、失败与稳定错误行为

- ResourceIO owner 不可用、活动根 scope 尚未建立或切换正在 drain 时，资源 mutation 返回既有 `knowledge_resource_unavailable`、HTTP 503、`retryable: true` 语义；不得回退到 Engine 用户目录或临时第二 owner。
- expected-version 不匹配继续返回既有 conflict 结果，保存不得覆盖新内容；调用者重新读取后才能重试。
- 已存在目标、重复创建或非法名称继续使用现有 `knowledge_resource_conflict`/校验语义；dialog 不自动发第二次请求。
- 跨来源 cut 明确拒绝且不改变源；跨来源 copy 失败时不删除源、不重写链接。
- 缺少 native grant、远程 provider 或 Web runtime 不支持原生动作时，菜单隐藏该动作；若通过旧入口调用，沿用现有 capability/precondition error，不伪造成功。
- 部分批量操作继续返回逐项 operation 结果，并由既有 journal/Trash 恢复；不得用单一成功布尔值掩盖失败项。

### 状态转换与不变量

- `main` 的真实根由当前活动工作目录决定；`sourceKey: main` 的 relative path 只能在该 owner scope 内解析。
- 一个 workspace scope 同时只有一个 Knowledge/ResourceIO owner；切换采用 stop-old-then-start-new，旧 scope 的 mutation 被拒绝。
- operation plan/commit、事件序列、Knowledge index 和 tree cache 使用同一 scope generation；过期事件只触发 resync，不写入新 scope。
- KnowledgeResourceAddress 始终 source-relative；绝对路径仅在受 Native Grant 保护的本地动作内部短暂使用。
- 同源 cut 是 move，跨来源 cut 是拒绝，copy 永不删除源；Trash 仍是删除/恢复事实源。
- 创建请求从第一次 submit 到成功/失败收敛不可重入；成功时 dialog 不再可交互。

## 3. 用户故事

- **US-001**：作为 Knowledge 编辑用户，我希望工作台选定的工作目录就是 `main` 并能保存编辑内容，以便聊天、工作台和知识看到同一文件事实。
- **US-002**：作为 Knowledge 用户，我希望新建页面或文件夹稳定完成且不会因重复点击产生冲突，以便创建后立即继续工作。
- **US-003**：作为 Knowledge 资源树用户，我希望右键使用工作台已有文件操作，以便不用学习第二套文件管理语义。
- **US-004**：作为需要处理多种文件的用户，我希望 PDF、图片、HTML/代码和 Markdown 使用系统已有 icon、预览和默认应用策略，以便打开行为可预测。
- **US-005**：作为需要整理来源的用户，我希望同源剪切可移动、跨来源剪切被明确拒绝、复制保持源不变，以便来源边界和链接语义不会被破坏。
- **US-006**：作为 fork 维护者，我希望修复集中在现有 owner、client、tree 和 Desk 适配 seam，并能按 upstream ledger 逐 checkpoint 遍历升级，以便本地二开不会在下一次上游更新时被大范围冲突覆盖。

## 4. 验收合同

| ID | 前置条件 | 动作或事件 | 可观察结果 | 验证接缝 |
|---|---|---|---|---|
| AC-001 | Engine 以工作目录启动，未显式注入额外 ResourceIO | 通过 Knowledge 列表读取、编辑保存、创建页面/文件夹、删除并提交 | 所有操作使用活动工作目录 `main` 的同一 owner；保存磁盘内容正确，create/delete 不返回 503 | `<Path>tests/knowledge-workspace-route.test.ts</Path>` 默认工作目录 fixture + composition regression |
| AC-002 | 已有文件和 expected version | 以匹配版本写入，再以过期版本写入 | 匹配写入成功并产生既有资源事件；过期写入保持冲突且不覆盖磁盘事实 | `<Path>tests/resource-io-route.test.ts</Path>` 与 Knowledge editor save tests |
| AC-003 | 工作根从 A 切换到 B | 切换后读取、写入 A/B 的资源 | 新 scope 只读写 B；旧 owner 不接受 mutation；registry、operation coordinator、watcher 和 tree cache 不混用 | `<Path>tests/knowledge-workspace-lifecycle.test.ts</Path>` + route composition test |
| AC-004 | create dialog 已打开且 name 合法 | 连续点击提交或重复键盘 submit | client create mutation 只调用一次；成功后 dialog 卸载，资源树 locate 至多一次，页面 open/focus 至多一次 | `<Path>desktop/src/react/__tests__/components/CreateResourceDialog.test.tsx</Path>` |
| AC-005 | create 目标已存在或 owner 暂不可用 | 提交一次，随后用户显式重试 | 分别保留现有 conflict 或 unavailable/retryable 语义；输入保留；没有后台自动第二次请求 | CreateResourceDialog component test + route tests |
| AC-006 | 资源树列出文件和文件夹 | 对单选/多选资源打开右键菜单 | 菜单复用既有工作台动作，提供适用的 cut/copy/delete/rename/path/open 操作；不适用项按 capability 隐藏或禁用 | KnowledgeResourceTree context-menu test + `<Path>desktop/src/react/ui/ContextMenu.tsx</Path>` contract |
| AC-007 | 资源为 `.md`、`.pdf`、`.jpg`、`.html` 等 | 单击或选择“默认应用打开” | Markdown 进入 Knowledge editor；其它类型复用 file-kind/remote preview；默认应用仅在有效 NativeResourceGrant/本地 runtime 下出现 | KnowledgeResourceTree open tests + `<Path>desktop/src/react/__tests__/utils/file-kind.test.ts</Path>` + `<Path>desktop/src/react/__tests__/utils/remote-file-preview.test.ts</Path>` |
| AC-008 | Web runtime 或远程挂载无本地路径 | 打开右键菜单并尝试路径/native 动作 | 不显示绝对路径、Finder/reveal 或默认应用；其它可用 preview/相对路径动作仍可用，不能伪造成功 | Knowledge tree capability test + Knowledge native route security tests |
| AC-009 | 剪贴板选择属于同一 workspace | 对同源资源执行 cut 后在目标目录 paste | 只产生一次 move operation；源消失、目标出现，事件/树定位收敛一次，源内容未复制出第二份 | `<Path>desktop/src/react/__tests__/stores/knowledge-clipboard-slice.test.ts</Path>` + `<Path>tests/knowledge-workspace-route.test.ts</Path>` |
| AC-010 | 剪贴板来源与目标 `sourceKey` 不同 | 执行 cut 或 copy paste | cut 在提交前 fail closed、源不变并提示 copy；copy 创建普通副本且不重写正文链接 | `<Path>tests/knowledge-copy-service.test.ts</Path>` + route integration |
| AC-011 | 存在 selection、拖拽、watcher 和右键动作并发 | 操作完成后触发资源事件或 stale cache | 使用既有 scope/sequence 机制刷新；旧事件只导致 resync，不回滚新事实、不混入另一挂载源 | `<Path>desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx</Path>` + resource event tests |
| AC-012 | 当前 fork 有 upstream checkpoint 待遍历 | 冻结 upstream/local SHA，生成 path overlap，逐路径分类并运行受影响合同测试 | 本地修复可按 `upstream accepted`、`HanaKDE kept`、`semantic integration`、`generated`、`deleted duplicate` 分类；不产生第二 owner/watcher/parser/route；ledger 记录实际 checkpoint 和证据 | `<Path>docs/upstream-sync-ledger.md</Path>` 的 sync procedure + `git diff --check` + affected test command |
| AC-013 | 用户请求使用文件操作 | 检查 UI 资源树和工具栏 | 熟悉命令以现有 icon 为主并有 tooltip/ARIA；文字不溢出；高风险/陌生命令保留短 label | Knowledge i18n/a11y contract + KnowledgeResourceTree UI tests |

## 5. 范围

### IN

- 让活动工作根成为 Knowledge `main` 与公开 ResourceIO 的单一 owner，并同步其 workspace lifecycle。
- 让 Knowledge mutation 继续经现有 ResourceIO、atomic/operation journal、copy service、Trash、Native Grant 和事件/index seam。
- 为 Knowledge resource tree 接入现有 Desk context actions、file-kind、remote preview、路径复制和默认应用能力投影。
- 修复 create dialog 的不可重入提交和成功后关闭/定位顺序。
- 补齐同源 cut/paste、跨来源 cut 拒绝、跨来源 copy 保持源不变的客户端与服务验证。
- 增加默认活动工作目录 composition、UI 生命周期、能力降级、打开策略、clipboard 和上游 checkpoint 遍历的回归证据。

### REUSE

- `<Path>core/engine.ts</Path>` 的现有 ResourceIO 生命周期与工作区运行时，而不是新增引擎级 provider。
- `<Path>server/routes/knowledge-workspace.ts</Path>`、`<Path>server/routes/resource-io.ts</Path>` 的现有 KnowledgeAddress、operation plan/commit、错误归一化和 recovery barrier。
- 现有 `<Path>core/knowledge-workspace/</Path>`、`<Path>lib/knowledge-workspace/</Path>` 服务、atomic coordinator、copy service、Trash 和 Native Grant contract。
- `<Path>desktop/src/react/components/desk/DeskTree.tsx</Path>`、`<Path>desktop/src/react/ui/ContextMenu.tsx</Path>` 的动作和菜单契约。
- `<Path>desktop/src/react/utils/file-kind.ts</Path>`、`<Path>desktop/src/react/utils/remote-file-preview.ts</Path>` 的文件类型与预览策略。
- `<Path>desktop/src/react/services/knowledge-workspace-client.ts</Path>`、`<Path>desktop/src/react/stores/knowledge-clipboard-slice.ts</Path>`、已有 Knowledge tree selection/watch/drag 机制。
- `<Path>tests/knowledge-workspace-route.test.ts</Path>`、`<Path>tests/resource-io-route.test.ts</Path>`、Knowledge component/service tests 和 `<Path>tests/knowledge-workspace-e2e/</Path>` 作为验证接缝。
- `<Path>docs/upstream-sync-ledger.md</Path>` 的冻结、overlap、五路分类、owner scan、分 checkpoint 验证和 ledger 记录方法。

### OUT

- **OOS-001**：重建 Knowledge 文件树、另造 parser/icon/preview 或复制一套 Desk 文件操作；已有系统能力足够，重复实现会扩大 fork 上游冲突面。
- **OOS-002**：把授权目录改成 Knowledge 挂载目录，或新增跨 agent 会话共享授权；两者属于不同安全边界。
- **OOS-003**：修改公共 KnowledgeAddress/ResourceIO DTO、引入绝对路径 API、改变 `main`/sourceKey 事实语义或增加数据迁移。
- **OOS-004**：跨来源 move、自动链接重写、绕过 `.trash` 的永久删除和 renderer 直接 Node FS。
- **OOS-005**：在本 change 内合并或发布 upstream；升级操作只作为兼容验收合同，具体 checkpoint 仍由独立集成流程负责。

## 6. 已锁定实现约束

- **DEC-001**：Knowledge `main`、活动工作目录和公开 ResourceIO 必须由单一 workspace-scoped owner 绑定；切换采用 stop-old-then-start-new。来源：`ADR-001`、永久 `0002-active-root-as-main.md`。
- **DEC-002**：Knowledge mutation 必须继续消费既有 ResourceIO、operation journal、Trash、事件和 Native Grant；不得在 route 或 UI 建第二 owner。来源：`ADR-001`、永久 `0005`、`0012`、`0014`、`0020`。
- **DEC-003**：同源 cut 才是 move；跨来源 cut fail closed；跨来源 copy 保持源和链接文本不变。来源：`ADR-002`、设计树 D-002、永久来源隔离决策。
- **DEC-004**：资源树复用 Desk ContextMenu、动作、file-kind、remote preview 和 native open policy；能力缺失时隐藏或稳定失败，不伪造成功。来源：`ADR-002`、设计树 D-003/D-004。
- **DEC-005**：创建 submit 首次触发后不可重入；成功先卸载 dialog，再进行单次 locate/open；失败保留输入并允许显式重试。来源：`ADR-003`、设计树 D-005。
- **DEC-006**：本地改动必须保持可遍历升级：每个 upstream checkpoint 先冻结 SHA 与 path overlap，再按 `docs/upstream-sync-ledger.md` 五路分类；冲突按 owner/契约重审，不用无冲突 merge 或 rerere 代替语义验证。来源：`docs/upstream-sync-ledger.md`。
- **DEC-007**：实现优先在现有稳定 seam 增加最小适配和回归测试；只有现有 seam 无法表达单一 owner 或受限菜单能力时，才扩展最小公共接口，并保持旧调用兼容。来源：用户决定、SpecDev planning principles。

## 7. 数据、接口与兼容

- **公共接口变化：** 目标是不改变现有 Knowledge resource、ResourceIO、operation plan/commit 和 clipboard DTO；如为 Desk/Knowledge 适配必须增加能力字段，必须是可选、向后兼容且不暴露绝对路径的投影。为满足本地菜单的“复制绝对路径”，Native Grant 增加 path-free 的 `copyPath` action/capability：路径只在受信任 Main 消费 grant 时写入系统剪贴板，不进入 Renderer/HTTP DTO。现有 `knowledge_resource_unavailable` 503、`knowledge_resource_conflict` 409 和 expected-version 行为保持稳定。
- **数据模型与持久化：** 无迁移。继续使用现有 ResourceIO 文件事实、operation journal、source-local `.trash`、Knowledge index 和 clipboard scope；不新增第二存储。
- **兼容要求：** `main` 继续表示活动工作目录；挂载来源保持独立 `sourceKey`；授权目录不等于挂载目录；已有 Desk、History、Agent file-change、Knowledge editor 和 remote provider 行为保持兼容。
- **Fork/upstream 兼容：** 本地修复按现有 integration ancestry 作为基线，不能要求大范围重排目录或复制上游实现。每次上游升级必须保留本 change 的 owner/安全不变量、实际 merge SHA、path overlap、分类和受影响测试证据；发生公共契约冲突时回到 Spec/Grill，不静默选择一侧。
- **迁移要求：** 不适用。磁盘格式、地址格式和权限模型不变。
- **发布或运维影响：** 不新增发布步骤；owner unavailable、scope 切换和 native capability 缺失继续通过既有可诊断状态和错误返回，便于重试与日志观测。

## 8. 非功能要求

- **NFR-001 安全与隐私：** 所有资源操作仍以 source-relative address、provider scope、expected version 和 Native Grant 为边界；Renderer 不取得原始绝对根，Web/远程场景不泄露绝对路径；owner、scope generation 和 operation journal 不可被 UI 绕过。
- **NFR-002 性能与容量：** 复用现有 list/watch/cache/preview 机制；不增加全树 shadow watcher、轮询调度器或重复 parser。右键菜单只为当前选择集计算能力，不预读无关来源。
- **NFR-003 可用性与可靠性：** 保存、创建、删除、paste 的失败必须可重试且不产生部分事实；旧 owner 切换时先 drain，重建失败保持明确 unavailable；UI submit、operation commit 和 clipboard mutation 均不可隐式重放。
- **NFR-004 可观测性与运营：** 继续使用现有 operation id、request hash、scope/event sequence、错误 code 和 Knowledge diagnostics；upstream checkpoint 记录在 `docs/upstream-sync-ledger.md`，不以“无冲突”作为完成证明。

## 9. 验证策略

| 接缝 | 层级 | 覆盖合同 | 现有先例或命令 | Evidence 类型 |
|---|---|---|---|---|
| Knowledge/ResourceIO 默认活动根 composition | route/composition integration | AC-001, AC-003, AC-011 | `npm test -- --run tests/knowledge-workspace-route.test.ts tests/resource-io-route.test.ts tests/knowledge-workspace-lifecycle.test.ts` | 定向 Vitest 输出 + 磁盘事实摘要 |
| expected-version 保存 | public API integration | AC-002 | `<Path>tests/resource-io-route.test.ts</Path>`、`<Path>desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx</Path>` | API/组件测试输出 |
| 创建 dialog 生命周期 | stable React seam | AC-004, AC-005 | `<Path>desktop/src/react/__tests__/components/CreateResourceDialog.test.tsx</Path>` | 组件测试断言请求次数、卸载和重试 |
| 资源树 context menu 与 icon/open | UI component + utility | AC-006, AC-007, AC-008, AC-013 | KnowledgeResourceTree tests、`<Path>desktop/src/react/__tests__/utils/file-kind.test.ts</Path>`、`<Path>desktop/src/react/__tests__/utils/remote-file-preview.test.ts</Path>` | 组件/工具测试，必要时 Playwright |
| 剪切/复制/粘贴与来源边界 | service/route integration | AC-009, AC-010 | `<Path>desktop/src/react/__tests__/stores/knowledge-clipboard-slice.test.ts</Path>`、`<Path>tests/knowledge-copy-service.test.ts</Path>`、route tests | operation 结果与源/目标磁盘断言 |
| native 能力与路径隐私 | security integration | AC-008 | `<Path>tests/knowledge-native-grant.test.ts</Path>`、`<Path>tests/knowledge-native-route-security.test.ts</Path>` | capability matrix 与安全测试输出 |
| watcher/cache scope 收敛 | event/lifecycle integration | AC-003, AC-011 | `<Path>tests/knowledge-index-event-coordinator.test.ts</Path>`、`<Path>desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx</Path>` | sequence/scope regression |
| fork upstream checkpoint 遍历 | repository/process contract | AC-012 | freeze SHA + path-overlap report + architecture/security scans + `git diff --check` + affected tests; update `<Path>docs/upstream-sync-ledger.md</Path>` | ledger checkpoint entry + command output |

## 10. 风险、假设与未决问题

### 风险

- 单一 owner 绑定横跨 Engine、server route、operation coordinator 和 watcher 生命周期；若只修某一 route，503 可能在另一 mutation 重现。
- Knowledge tree 与 Desk action 的输入类型不同，适配层若泄露绝对路径或绕过 grant 会扩大安全边界。
- fork 上游升级可能同时修改同一 seam；直接套用上游实现可能重新引入第二 owner 或丢失本地安全增强。
- 远程挂载、Web runtime 和 native bridge 的能力集合不同，需要保持 UI 投影与服务端能力一致。

### 已采用的低影响假设

- 现有 `KnowledgeWorkspaceClient`、operation client、ResourceIO expected-version 和 Native Grant contract 继续作为稳定入口；若实现阶段发现某个 seam 缺少最小适配，则增加可选、向后兼容的 adapter，并以对应合同测试证明。
- 现有 Workbench `ContextMenu` 的 CSS/icon 主题可承载 Knowledge 菜单；若局部样式不适配，只调整复用组件的投影样式，不另建菜单系统。
- 上游升级流程继续以 `docs/upstream-sync-ledger.md` 的当前 integration ancestry 为基线；上游目标变化时先更新冻结记录和影响分析，再决定是否需要返回 Grill。

### 未决问题

无。
