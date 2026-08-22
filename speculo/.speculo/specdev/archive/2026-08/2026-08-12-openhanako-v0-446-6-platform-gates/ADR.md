# ADR: openhanako v0.446.6 平台 Gate 与启动完整性

## ADR-001: 平台阻断 Gate 独立后续化

**Status:** accepted
**Source:** LOG-001
**Supersedes:** none

### Context
原 umbrella change 的大部分功能整合已完成，但 Windows/macOS 阻断 Evidence 和最终验收尚未完成；把未验证平台事实归档为完成会制造错误发布结论。

### Decision
T-22、T-23 与 T-25 由当前 active change 继续拥有；归档 change 的已完成 Ticket 与 Evidence 作为只读前置，不复制为新实现任务。

### Trade-off
维持 active follow-up 会延长 v0.446.6 收口周期，但保留了平台阻断语义和 Evidence 新鲜度。

### Consequences
当前 change 只有在真实 Windows/macOS Gate 和最终验收全部通过后才能完成。

### Verification / Migration
T-25 检查最终 SHA、双平台 Evidence 与全部验收合同。

## ADR-002: 平台 Gate 发现的阻断产品缺陷留在当前 change

**Status:** accepted
**Source:** LOG-003 / USER-DECISION:platform-gates-owns-bug
**Supersedes:** none

### Context
旧 Spec 把产品修复列为 OUT，T-22 也只授权 Windows harness。真实 Windows 执行现已发现会阻止 Server 启动的产品缺陷；让 T-22 越权修复会破坏路径所有权，另开 change 又会切断当前发布 Gate 的因果链。

### Decision
在当前 change 新增 T-27 作为唯一产品修复 owner；T-22/T-23 在 T-27 的固定点后重跑，T-25 最终汇总。平台 Ticket 不修改 T-27 所有的产品路径。

### Trade-off
当前 change 的范围从“只验证”扩大到“一次有界产品修复加重验”，但换取了单一 Gate 责任链和明确所有权。

### Consequences
Spec 增加 AC-029—AC-031；DAG 变为 T-27 扇出到 T-22/T-23，再汇合到 T-25。

### Verification / Migration
Tickets Map 必须证明无路径冲突，双平台 Evidence 必须基于 T-27 后的最终固定点。

## ADR-003: 开发依赖损坏采用前置完整性门禁而非自动修复

**Status:** accepted
**Source:** LOG-004 / LOG-005 / DIAG-001
**Supersedes:** none

### Context
npm 的增量安装可以保留“版本元数据正确但包内文件残缺”的目录。把单个缺失路径写成特例不能覆盖未来包，也不能阻止昂贵构建和 Electron 启动。

### Decision
抽取现有 external entrypoint verifier 为共享 primitive，并保留两种明确 scope：packaged build wrapper 默认维持既有 `root-only` 语义，避免 NFT prune 后对未使用 subpath 误报；根开发安装使用 `all-exact`，校验所有生产依赖的精确非通配运行时 exports，并对 Pi AI 执行真实 ESM import smoke。门禁接入 postinstall 和开发入口；失败立即停止并指导 `volta run npm ci`，产品进程不得自动改写依赖。

### Trade-off
每次开发启动增加一次只读依赖检查，并可能暴露此前被延迟到 Server import 的安装问题；代价小于完成多段构建后才失败。

### Consequences
依赖完整性成为安装和源码运行合同；Node、Pi SDK、typebox 与 lock 版本保持不变。

### Verification / Migration
使用残缺 package fixture、完整 fixture、Pi import smoke、postinstall 和 launcher contract 测试；不做数据迁移。

## ADR-004: 开发态与打包态使用不同恢复语义

**Status:** accepted
**Source:** LOG-005 / LOG-006
**Supersedes:** none

### Context
当前 Desktop 把所有 `ERR_MODULE_NOT_FOUND` 解释为自动更新文件落地，并统一重试。这在源码开发模式中不成立；打包模式则已有签名 seed 和白名单组件修复能力。

### Decision
开发态模块完整性失败零重试、给出干净安装命令；打包态保留一次短退避，持续失败时显示“修复并重启/退出”，只在用户确认后执行现有 artifact repair。修复失败不得重启循环。

### Trade-off
错误处理增加运行模式分类和一个启动恢复交互，但错误建议变得可执行，且不会把开发依赖与用户组件混为一谈。

### Consequences
Desktop 需要稳定的内部错误分类、本地化文案和恢复测试；组件修复仍不触碰用户数据。

### Verification / Migration
测试开发态零重试、打包态一次重试、确认/取消/修复失败分支和 artifact 白名单；无需持久化迁移。
