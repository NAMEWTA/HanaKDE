---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-15
title: 交付安全 restore 与全读面收敛
status: review
planning_depth: deep
planning_depth_reason: "restore 会覆盖用户文件，跨 ResourceIO、History、Knowledge、Preview、Search 与 Agent Read，涉及 TOCTOU 和数据完整性。"
ready: true
risk: critical
blocked_by: [T-12, T-13, T-14]
contract_ids: [AC-015, AC-016, AC-017, AC-026]
owner: Worker-T-15
deviations: [D-T15-01, D-T15-02, D-T15-03, D-T15-04, D-T15-05, D-T15-06]
expected_changes: ["<Path>lib/file-history/**</Path>", "<Path>server/routes/file-history.ts</Path>", "<Path>core/workspace-runtime/production-workspace-runtime.ts</Path>", "<Path>lib/resource-io/types.ts</Path>", "<Path>lib/resource-io/resource-refs.ts</Path>", "<Path>lib/resource-io/root-identity.ts</Path>", "<Path>lib/resource-io/native-secure-write.ts</Path>", "<Path>lib/resource-io/providers/local-fs-provider.ts</Path>", "<Path>desktop/native/HanaSecureFsHelper/**</Path>", "<Path>scripts/build-secure-fs-helper.mjs</Path>", "<Path>package.json</Path>", "<Path>core/knowledge-workspace/**</Path>", "<Path>desktop/src/react/utils/preview-document-refresh.ts</Path>", "<Path>tests/file-history-*.test.ts</Path>", "<Path>tests/production-workspace-runtime.test.ts</Path>", "<Path>tests/resource-io-local-fs-provider.test.ts</Path>", "<Path>tests/resource-io-native-secure-write.test.ts</Path>", "<Path>tests/fixtures/secure-fs-helper/**</Path>", "<Path>tests/knowledge-*.test.ts</Path>"]
writable_paths: ["<Path>lib/file-history/**</Path>", "<Path>server/routes/file-history.ts</Path>", "<Path>core/workspace-runtime/production-workspace-runtime.ts</Path>", "<Path>lib/resource-io/types.ts</Path>", "<Path>lib/resource-io/resource-refs.ts</Path>", "<Path>lib/resource-io/root-identity.ts</Path>", "<Path>lib/resource-io/native-secure-write.ts</Path>", "<Path>lib/resource-io/providers/local-fs-provider.ts</Path>", "<Path>desktop/native/HanaSecureFsHelper/**</Path>", "<Path>scripts/build-secure-fs-helper.mjs</Path>", "<Path>package.json</Path>", "<Path>core/knowledge-workspace/**</Path>", "<Path>desktop/src/react/utils/preview-document-refresh.ts</Path>", "<Path>tests/file-history-*.test.ts</Path>", "<Path>tests/production-workspace-runtime.test.ts</Path>", "<Path>tests/resource-io-local-fs-provider.test.ts</Path>", "<Path>tests/resource-io-native-secure-write.test.ts</Path>", "<Path>tests/fixtures/secure-fs-helper/**</Path>", "<Path>tests/knowledge-*.test.ts</Path>"]
read_only_paths: ["<Path>lib/resource-io/resource-io.ts</Path>", "<Path>core/engine.ts</Path>", "<Path>desktop/src/react/components/**</Path>"]
shared_paths: ["<Path>package.json</Path>"]
shared_path_owners: ["<Path>package.json</Path> => T-15 (dev/test secure-helper build only; T-21 retains later production artifact/package integration)"]
---

# Ticket T-15: 交付安全 restore 与全读面收敛

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/15-deliver-secure-restore-convergence.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-15.md</Path>`

## 1. 战略与来源

- **目标：** 通过唯一 ResourceIO write path 实现带 expected-current-version 与 effect 前 scope proof 的 restore，并让 Disk、Preview、History、Knowledge、Search 和 Agent Read 收敛。
- **可观察产出：** 合法 restore 可反悔；过期版本、root replacement 或越界请求稳定拒绝且磁盘不变；成功后所有读取面显示同一内容。
- **来源：** `US-003`、`US-005`、`US-006`、`US-011`、`AC-015`—`AC-017`、`AC-026`、`ADR-003`、`ADR-005`、`ADR-007`。
- **当前事实：** 上游有 History restore route/service 先例；HanaKDE ResourceIO/Root Identity/Knowledge/Preview/Agent Read 提供更完整 authority 与收敛链。
- **Planning Depth 原因：** 覆盖用户文件是高事故操作，且 TOCTOU 和跨 read model convergence 必须端到端验证。

## 2. 决策状态

### 已锁定决策

- restore 必须携带 expected current version，并在 effect 前重新证明 main root、resource scope 和 current version。
- 写盘只经 ResourceIO，origin/correlation 为 `history_restore`；restore 生成一个可再次恢复的新版本。
- stale/root replacement/unknown/越界时拒绝且当前磁盘内容不变。
- 成功 mutation 通过 ResourceEventBus 驱动所有 read models；不得从 route 逐个直接刷新或维护 shadow truth。

### 已采用的低影响假设

- 版本 token 的具体编码沿用 History/Resource 当前 opaque version contract，外部只比较不解释。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| restore domain/route、expected version、TOCTOU revalidation、EventBus convergence、recoverable restore snapshot | T-10 ResourceIO/Root Identity、T-13 History、T-14 Knowledge repair | UI modal、mount/remote History、direct DB writes、legacy migration |

## 4. 要构建什么

用户从 timeline 选择旧版本并提交当时看到的 current version。服务在写入前重查 authority、root identity、scope 和 version；任一变化都返回可识别冲突/安全失败且不写盘。合法请求经 ResourceIO 提交一条 `history_restore` mutation，新 History current version可反悔，并最终让 Preview、Knowledge、Search 与 Agent Read 一致。

## 5. 实现契约

- **入口或接缝：** main-bound History restore route/domain、ResourceIO conditional write、ResourceEventBus convergence tests。
- **输入与输出：** authorized resource key + target history version + expected current version → restored version/correlation or typed conflict/security failure。
- **公共接口变化：** restore request/response 使用 opaque resource/version，不接受 raw root/public workspaceId。
- **不变量：** effect preflight immediately precedes write；single write path；restore snapshot recoverable；read models derive from event not route callbacks。
- **状态或数据流：** select version → reauthorize/revalidate → conditional ResourceIO write → event → History/Knowledge/UI/Agent projections。
- **错误与失败行为：** stale/TOCTOU/scope/root fail without disk change；post-write subscriber failure 保留成功 mutation并进入 DEGRADED/repair。
- **兼容要求：** 不支持旧无 expected-version restore 或 path-root payload；未发布基线直接使用最终 contract。
- **安全与隐私要求：** authorization/effect-time proof、防 symlink/junction swap、external response 无 absolute path/content leak。

## 6. 执行路线

1. 用 stale version、root replacement、symlink/junction swap 和 success round-trip 建立红色合同。
2. 定义 main-bound opaque restore DTO 与 typed conflict/security failures。
3. 将 restore 实现为 ResourceIO conditional write + `history_restore` correlation，删除 direct fs/DB write。
4. 确保 mutation 先形成可恢复 History version，再由统一事件驱动 Knowledge/Preview/Search/Agent convergence。
5. 注入 subscriber failure/gap，验证 DEGRADED → RECONCILING → HEALTHY/FAILED 与 scoped retry。
6. 运行端到端一致性断言和 direct-refresh/shadow-truth 结构 scan。

## 7. 路径访问契约

- **预计修改点：** restore History domain/route、Knowledge convergence bridge、Preview refresh 与 tests。
- **可写范围：** 仅 frontmatter `writable_paths`；Resource Kernel 和 workspace owner 只读。
- **只读上下文：** Kernel、workspace runtime、Engine 与 UI components。
- **共享路径：** 无；依赖 T-12/T-13/T-14 后串行汇合。
- **保留或不动：** History UI、Agent filter UI、Office/Extraction、mount resources。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | restore E2E integration | B → restore A → wait convergence | disk/preview/history/knowledge/search/agent read = A；restore 可反悔 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-15.md</Path>` |
| 失败路径 | TOCTOU/security matrix | stale version、root replace、scope escape、subscriber failure | pre-write failures磁盘不变；post-write failure可见且repair | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-15.md</Path>` |
| 回归 | route/structural suite | History/Resource/Knowledge tests + direct fs/direct refresh scan | 既有合同绿色，唯一写入/事件路径 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-15.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** route/domain contract → isolated conditional write → production event convergence；无 legacy restore migration。
- **兼容窗口：** 无：旧无 version/raw path request 不支持。
- **监控信号：** restore conflicts/security rejects、correlation ids、consumer lag/gap、health transitions。
- **回滚或前向恢复：** 每次成功 restore 本身创建可反悔版本；代码恢复遵守 stop-then-start，不双写。
- **不可逆操作与批准点：** restore 是用户明确动作且可反悔；任何破坏性 cleanup 不在范围，Git integration 需授权。
- **收缩条件：** direct filesystem restore、route fan-out refresh 和无 expected-version 调用点为零。

## 10. 验收标准

- [ ] `AC-015`：合法 restore 只经 ResourceIO，带 correlation 且产生可反悔版本。
- [ ] `AC-016`：stale/root/scope/TOCTOU 请求拒绝且磁盘不变。
- [ ] `AC-017`：所有六个读取面最终一致。
- [ ] `AC-026`：restore route 不接受 raw root/public workspaceId 且不泄漏绝对路径。
- [ ] 验证与结构 scan 记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-15.md</Path>`。

## 11. 偏差 D-T15-01：主 Workspace restore authority 接缝

- **等级与状态：** ticket / approved。
- **触发事实：** `MainFileHistoryBinding` 只提供订阅和有界读取；`server/routes/file-history.ts` 只能获得已经激活的 History service，不能安全地取得或重建 main root。若 route 直接组装 filesystem path 或 ResourceIO ref，将绕过 `MainWorkspaceRootProof` 的 canonical root authority，无法在 effect time 保证 AC-015/AC-016。
- **受影响路径与工件：** 唯一新增可写生产路径为 `<Path>core/workspace-runtime/production-workspace-runtime.ts</Path>`，且只新增 main-bound restore adapter；唯一新增测试路径为 `<Path>tests/production-workspace-runtime.test.ts</Path>`。ResourceIO 路径初始只读，D-T15-02 仅额外授权 local provider implementation 与其 focused test；`<Path>core/engine.ts</Path>` 和 renderer component paths 仍只读。
- **批准路线：** 在现有 `MainFileHistoryBinding` 上增加窄 `restore` operation。它必须在 sole write 前重新取得并比对 main root identity、重新 stat/canonicalize target、验证 authorized relative path 与 opaque expected-version token；随后仅调用既有 `ResourceIO.writeExpectedVersion`，并带 `source: "api"`、`reason: "history_restore"` 和 operation correlation。route 只能提交 opaque `snapshotId`/expected token，不能构造 raw root/path 或 fan-out refresh。
- **不变约束：** 不改 ResourceIO public contract、不新增 watcher/baseline/EventBus、不使用 direct filesystem/DB restore、不新增 workspaceId、迁移或 compatibility mode。successful restore 必须由 canonical event 驱动 consumers，并以 `origin: "restore"` 写入可反悔 History boundary；T-16 仍独占 UI E2E。D-T15-02 仅替代本条对 local provider implementation 的只读限制。
- **批准：** Root Lead，2026-08-10T15:13:18+0800；范围仅为上述路径授权、adapter 设计与相应 focused tests。Spec/ADR 的外部行为、AC 和 Gate 依赖不变。

## 12. 偏差 D-T15-02：provider-held conditional-write proof

- **等级与状态：** architecture/security / approved；外部合同和 AC 不变。
- **触发事实：** D-T15-01 的 binding proof 不能单独封闭 AC-016 所要求的 effect-time root/ancestor/final symlink TOCTOU。既有 `LocalFsProvider.writeExpectedVersion` 会在 binding 检查后再次 resolve target，并在 `write()` 中再次 resolve；没有 provider-held ancestry/identity/no-follow proof 时，same-mtime/size replacement 仍可能写入替换后的 root。
- **受影响路径与工件：** 新增且仅新增 `<Path>lib/resource-io/providers/local-fs-provider.ts</Path>` 与 `<Path>tests/resource-io-local-fs-provider.test.ts</Path>` 可写。`<Path>lib/resource-io/resource-io.ts</Path>` 和 `<Path>lib/resource-io/types.ts</Path>` 继续只读；若已有方法签名无法承载 provider-owned proof，必须再次停止并建立更小的后续 deviation，不能隐式扩展。
- **批准路线：** 强化现有通用 `writeExpectedVersion` provider boundary：复用 provider-owned ancestry/identity/no-follow proof 并在写入 effect time 重新验证 root、ancestor 和 final target。不得新增 restore-special write API、route-provided proof、shadow authority 或第二 mutation path。若 Node file API 无法诚实封闭最后 race，升级到最小 native helper/handle-bound primitive，仍不得弱化 AC-016。
- **验证升级：** 在隔离 fixtures 中 fault-inject proof 后的 root、ancestor 和 final symlink swaps，以及 same-mtime/size replacement；每种情况均断言 no disk write。验证必须在 macOS/Windows 语义下可阻断；T-15 只证明 backend/event seam，T-16 仍拥有 UI E2E。
- **批准：** Root Lead，2026-08-10T15:21:16+0800；范围仅为上述 provider hardening、focused tests 与恢复收敛的既有 T-15 paths。任何 public ResourceIO API、native helper、route DTO 或 product contract 扩展必须重新停下裁决。

## 13. 偏差 D-T15-03：系统本体 secure conditional write primitive

- **等级与状态：** architecture/security / approved；Feature Placement 裁决为 HanaKDE 系统本体，不是插件。它定义跨 ResourceIO/History 的特权、启动即用的安全写入 primitive，不能由插件贡献面、权限模型或可删除生命周期承载。
- **触发事实：** Node v22 没有 `openat`/dirfd-relative child open；`O_NOFOLLOW` 不能在 macOS 与 Windows 上证明 ancestor/junction-safe traversal。任何仅用 Node pathname revalidation 的实现都会留下 AC-016 root/ancestor/final swap window，不能声称 disk unchanged。
- **受影响路径与工件：** 仅 frontmatter 列出的 ResourceIO internal runner、local provider、`<Path>desktop/native/HanaSecureFsHelper/**</Path>`、dev/test build script、`<Path>package.json</Path>` 和 focused tests/fixtures 可写。`package.json` 的临时 owner lease 只加入开发/测试 helper build；T-21 继续独占 production artifact/package closure、lockfile 与 CI，不得被提前替代。
- **批准路线：** 新增单一 internal `secure conditional write` module 与同一 protocol/源码的 cross-platform C++ helper；runner 通过 bounded stdin/stdout framed contract 调用。macOS 使用 dirfd/openat no-follow handle traversal；Windows 使用 `CreateFileW`、`FILE_FLAG_OPEN_REPARSE_POINT`、逐段 reparse/final-path/file-id verification。target handle 在 truncate/write 前完成 root、ancestor、identity 与 expected-version proof；helper missing/unsupported/fault 必须 fail closed，绝无 Node fallback、dual run、route proof 或第二 filesystem。
- **隐私与接口：** private provider proof 只能停留在 symbol/WeakMap seam；route/UI 不接收 raw root/native identity，helper 不记录 content 或 absolute path。`ResourceIO.writeExpectedVersion` 仍是唯一上层 mutation interface，History 仍通过 binding 调用它。
- **验证升级：** 先完成 design-it-twice 和 native red tests；注入 proof 后 root/ancestor/final swap、same-mtime/size replacement、helper unavailable/invalid frame，均断言 no disk write 和稳定 conflict/security mapping。Windows/macOS 实机与 production packaging 保持 T-22/T-23/T-21 blocking ownership；T-15 只建立 dev/test executable primitive。
- **批准：** Root Lead，2026-08-10T15:38:11+0800；若 C++ handle semantics不能在任一阻断平台证明，helper 内可使用稳定 handle-relative platform primitive，但不得扩大 route/public contract、引入 Node fallback 或弱化 AC-016。

## 14. 偏差 D-T15-04：内容绑定的 restore authority 链

- **等级与状态：** ticket / approved；不改变 Spec、ADR、公共 ResourceIO API 或 AC-015/016/017/026。
- **触发事实：** 当前 `opaqueVersionToken()` 仅由 `ResourceVersion` 的 metadata 字段组成；攻击者或并发替换可用相同 mtime/size 产生同一公开 token。`FileHistoryStore.recordSnapshot()` 亦把相同 opaque token 视为与内容哈希等价的 dedupe authority。因此，UI 已读版本后进行同大小、同 mtime 的替换，可能在 restore 预检中被误认作同一当前文件，违反 AC-016 的 no-write 合同。
- **受影响路径与工件：** 既有 T-15 可写路径内的 `<Path>core/workspace-runtime/production-workspace-runtime.ts</Path>`、`<Path>lib/file-history/history-store.ts</Path>`、`<Path>lib/resource-io/resource-refs.ts</Path>`、`<Path>lib/resource-io/providers/local-fs-provider.ts</Path>`、`<Path>lib/resource-io/native-secure-write.ts</Path>` 及其 focused tests/fixture。没有新增路径、shared-path lease、route DTO、UI 或 public ResourceIO API。
- **批准路线：** (1) capture/read/restore 用 opaque `sha256(version fields + bounded content bytes)` 作为 current token；(2) History dedupe 只以 content hash 为 authority，同 token 的不同字节必须新增或按既有 merge 规则合并 snapshot；(3) restore effect preflight 必须在 main scope 内重新完成 bounded read、导出该内容绑定 token 并与 UI token 比较，然后才调用既有 `ResourceIO.writeExpectedVersion`；(4) `resource-refs.ts` normalize 时保留 non-enumerable、WeakSet-attested LocalFS `RESOURCE_READ_PROOF` 与 `RESOURCE_SCOPE_ROOT`；(5) provider 只接受与 secure-write preflight 精确身份相符的 completed-read proof，native helper 再以其 native proof 使 preflight 后 swap 在 helper boundary fail closed；(6) scope root 必须是已 resolve 的 main root，不能从 provider cwd 开始；(7) 不向 route/UI/event 暴露 native identity、raw root、content proof 或 symbol payload。
- **验证升级：** 先红后绿证明 content-only dedupe、相同公开 mtime/size 而不同内容产生不同 token、UI-old token 对同大小/mtime replacement 拒绝且保留新旧文件，以及 completed read 到 provider preflight 之间的 replacement 因携带 proof 被拒绝且无写盘。native helper 在这些验证全部绿色且 Lead 明确解除冻结前不得扩展。
- **批准：** Root Lead，2026-08-10T16:29:40+0800；范围仅为上述 authority-chain correction、既有 T-15 paths 和 focused tests。发现需要新 public API、Spec/ADR 更改或额外路径时必须再次停止并建立偏差。

## 15. 偏差 D-T15-05：激活 root object-identity authority

- **等级与状态：** ticket / approved；不改变 Spec、ADR、AC、公共 ResourceIO API、DTO 或 T-15 可写路径。
- **触发事实：** D-T15-04 的 fresh read/ref 只保留了 WeakMap-attested root 字符串和当次 read proof。若 `restoreMainFileHistoryContent` 在 `revalidateRoot` 后、`stat` 前把 main root 替换为同内容、同 metadata 的对象，替换后的 root 可重新取得 read proof 和 provider native proof；两者都不再能证明它是 activation 时 `MainWorkspaceRootProof.identity` 对应的 root，AC-016 尚未闭合。
- **受影响路径与工件：** 已授权的 `<Path>core/workspace-runtime/production-workspace-runtime.ts</Path>`、`<Path>lib/resource-io/root-identity.ts</Path>`、`<Path>lib/resource-io/resource-refs.ts</Path>`、`<Path>lib/resource-io/types.ts</Path>`、`<Path>lib/resource-io/providers/local-fs-provider.ts</Path>` 及 focused runtime/provider tests。不得修改 native helper、协议、build/package；不得以额外 pathname revalidate 替代 object-identity comparison。
- **批准路线：** binding 在 activation 时将原始 `ProviderRootIdentity` 作为 module-private、non-enumerable object-identity authority 附着到 scoped ref；normalize 必须保持它，但 structural copy、symbol forged 或未 attest ref 都不能获得该 capability。`root-identity.ts` 的 private WeakMap proof 必须保存或提供 activation native root identity；LocalFs provider 在 capture native helper proof 前比较 ref 的 activation identity 与当前 native root identity，只有精确相同才进入既有 helper seam。native helper 随后重验同一 expected root handle，继续作为 post-preflight swap 的 fail-closed boundary。
- **验证升级：** 新增 red test：`revalidateRoot` 返回原 proof 后、`stat` 前把 root 替换为同内容/metadata；restore 必须拒绝，原 root 与替换 root 均无写盘，helper marker 不存在。保留 D-T15-04 的 forged/copy proof cleanup 断言。该 red/green 通过且 Lead 明确解除前，helper 继续冻结，G5 不得关闭。
- **批准：** Root Lead，2026-08-10T17:01:55+0800；范围仅为上述 activation-root authority 链和既有 focused tests。若实现需要新 public capability、第二写入路径、native protocol/helper 改动或路径扩张，必须再次停止并建立偏差。

## 16. 偏差 D-T15-06：原子 root identity snapshot

- **等级与状态：** ticket / approved；不改变 Spec、ADR、AC、公共 ResourceIO API、DTO、helper/protocol 或 T-15 可写路径。
- **触发事实：** `resolveLocalFsRootIdentity` 先以 `fs.statSync(canonicalPath)` 派生 public opaque/scope token，再以独立 `lstatSync(..., { bigint: true })` 派生 private native identity。root 在两次采样之间替换时，一个 `ProviderRootIdentity` 的 public 与 private halves 会来自不同对象，使 D-T15-05 的 activation authority comparison 建立在混合 identity 上。
- **受影响路径与工件：** 已授权的 `<Path>lib/resource-io/root-identity.ts</Path>`、`<Path>lib/resource-io/types.ts</Path>`、`<Path>lib/resource-io/providers/local-fs-provider.ts</Path>`、`<Path>core/workspace-runtime/production-workspace-runtime.ts</Path>` 及既有 focused provider/runtime/native tests。不得添加新的 public identity API、第二 pathname compare 或 helper/protocol/build/package 改动。
- **批准路线：** 以一次 no-follow BigInt stat 或持有 handle 的 snapshot 同时派生 public opaque root/scope token、version fields 和 private native root identity；该 helper 的输出成为 `ProviderRootIdentity` 的唯一构造事实。构造后任何校验只比较该 snapshot 的 object/native identity，不得重新按路径采样以“修复”竞态。若平台无法获得可同时满足 public/private 派生的单次 snapshot，必须 fail closed，不得拼接两次结果。
- **验证升级：** 在 identity snapshot seam 注入旧两调用之间的 root replacement，证明单次 snapshot 构造不会产出混合 identity；结构/行为断言确认 `resolveLocalFsRootIdentity` 没有分离的 public `statSync` 与 private `lstatSync` 采样，provider 在 mismatch 时 helper marker 不存在且无写盘。D-T15-05 root-replacement 与 D-T15-04 forged/copy cleanup tests 必须保留。
- **批准：** Root Lead，2026-08-10T17:15:01+0800；范围仅为上述 one-snapshot internal correction 与 focused tests。若需要路径扩张、public identity 暴露、helper/protocol 变更或第二写入路径，必须再次停止并建立偏差。
