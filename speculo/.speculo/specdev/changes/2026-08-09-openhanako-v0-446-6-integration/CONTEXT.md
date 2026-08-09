# openhanako v0.446.6 整合

**受仓库事实约束的设计基线**：指定集成计划中的明确目标、架构不变量、non-goals、模块所有权与验收要求默认约束本 change；具体路径、类型、阶段和实现建议必须用当前 `hanakde`、既有 change 合同、固定上游 tag 和真实验证能力复核。冲突必须显式裁决，不能照抄计划，也不能让现有代码静默改写目标。
_Avoid_: 最终文档所以无需审核、代码存在所以自动正确、按旧路径施工

**跟随式融合整合**：以冻结的官方上游版本为新基座，正常迭代与优化默认完整吸收；只有确实触及 HanaKDE 产品、安全、数据或开放边界合同时才进行语义融合。同类型 primitive 迁移到单一 owner 后删除重复实现，不为 fork 的旧内部结构长期保留兼容壳。
_Avoid_: ours/theirs 覆盖、双实现保险、为了旧内部代码拒绝正常上游升级

**主 Workspace（`main`）**：用户当前选择的工作目录，也是 HanaKDE 唯一真正的工作空间和 Workspace File History 范围。切换工作目录就是切换主 Workspace，不另设保持旧身份的 relocation 产品动作。
_Avoid_: 多个主 Workspace、把额外挂载提升为 main、Workspace relocation 功能

**额外挂载目录**：附加到当前主 Workspace 的额外文件目录/链接，用于既有挂载能力；它不是另一个 Workspace，也不进入本轮 Workspace File History。
_Avoid_: 额外 Workspace、挂载来源历史库、自动提升为 main

**Workspace File History**：围绕主 Workspace 物理文件的版本、diff、删除记录、restore 与 retention；作用域属于 Workspace，不属于某次 Agent 对话。
_Avoid_: Agent 会话历史、挂载目录历史、按 Agent 分叉物理历史事实源

**Agent 对话文件变更历史**：围绕某次 Agent 对话、操作或 checkpoint 展示其文件影响的上下文历史。它与 Workspace File History 的产品作用域不同，但应复用同一 ResourceIO、事件、版本、diff/restore 等可共享底层能力，不建立第二套物理观察和写入事实源。
_Avoid_: 与 Workspace File History 合并为一个 UI、重复 watcher、重复文件写入通道

**Workspace 资源身份**：`main` 继续由现有 Workspace/Knowledge 生命周期表达；`sourceKey=main` 负责来源路由，ResourceRef 负责资源定位，ProviderRootIdentity 负责物理身份与安全证明。File History 可以拥有最小私有存储键，但本轮不新增用户可见或跨功能公共 `workspaceId`。
_Avoid_: 新公共 workspaceId、把 path hash 当跨功能身份、用 File History 私有键重构现有 Workspace 状态

**单 owner 直接切换**：同一物理 root 的 mutation、watcher 和完整 baseline walk 在任何时刻只能由一套生产路径拥有。新路径先在隔离环境验证，切换或回滚都必须先停当前 owner 再启用目标 owner，不允许临时双运行。
_Avoid_: 影子双读、双 watcher、双写、双 baseline walk

**发布阻断平台**：本 umbrella change 以 Windows 和 macOS 为平台完成门；两者的资源安全、文件监听、production build 与 native extraction packaging 必须通过。Linux 验证结果不阻断本 change 完成。
_Avoid_: 把 Linux 门禁静默加入本 change、用跨平台抽象测试替代 Windows/macOS 原生证据

**无迁移基线**：HanaKDE 当前尚未发布，本次颠覆性整合直接建立新的唯一数据与基础设施基线。不得设计 legacy 数据迁移、兼容窗口、迁移回滚、旧 Profile 导入或旧数据清理流程；运行时初始化与安全失败按正常健康/安全合同处理。
_Avoid_: 预防性迁移、旧 schema 兼容层、migration marker、把运行时初始化失败包装成迁移流程

**资源一致性健康状态**：统一使用 `HEALTHY`、`DEGRADED`、`RECONCILING`、`FAILED` 表示 watcher、事件、baseline reconciliation 与下游 Knowledge 收敛状态。状态和必要错误必须真实可见并支持 scoped retry，但不要求新增复杂运维界面。
_Avoid_: 静默丢事件、把降级报告为正常、只能全 Workspace 重建、独立业务健康事实源

**Umbrella 完成门**：本 change 只有在校正后的 15 项 Definition of Done 全部获得可重复 Evidence 后才能完成，覆盖 `v0.446.6` ancestry、HanaKDE 二开无回退、Resource/History/Knowledge/Extraction 一致性、Windows/macOS 原生门禁、production packaging、去冗余及 sync ledger。削减任何一项必须先修改 Spec 并走 deviation control。
_Avoid_: merge 无冲突即完成、用单平台证据代替双平台门禁、把未完成项静默移到后续
