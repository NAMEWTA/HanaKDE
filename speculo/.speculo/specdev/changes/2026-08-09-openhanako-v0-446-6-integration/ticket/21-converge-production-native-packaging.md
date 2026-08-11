---
schema_version: 3
artifact: ticket
change: 2026-08-09-openhanako-v0-446-6-integration
id: T-21
title: 收敛 production 与 native packaging
status: in_progress
planning_depth: deep
planning_depth_reason: "根依赖、lockfile、native converter assets、Electron/server build 与双平台生产包是共享发布核心和供应链边界。"
ready: true
risk: critical
blocked_by: [T-12, T-16, T-17, T-18, T-20]
contract_ids: [AC-002, AC-003, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-027]
owner: Worker-T-21 / Lead Gate
expected_changes: ["<Path>package.json</Path>", "<Path>package-lock.json</Path>", "<Path>scripts/build-*.mjs</Path>", "<Path>scripts/compute-cli-closure.mjs</Path>", "<Path>.github/workflows/build.yml</Path>", "<Path>.github/workflows/ci.yml</Path>", "<Path>tests/electron-builder-native-rebuild.test.ts</Path>"]
writable_paths: ["<Path>package.json</Path>", "<Path>package-lock.json</Path>", "<Path>scripts/build-*.mjs</Path>", "<Path>scripts/compute-cli-closure.mjs</Path>", "<Path>.github/workflows/build.yml</Path>", "<Path>.github/workflows/ci.yml</Path>", "<Path>tests/electron-builder-native-rebuild.test.ts</Path>"]
read_only_paths: ["<Path>lib/document-extract/**</Path>", "<Path>lib/resource-io/**</Path>", "<Path>core/engine.ts</Path>", "<Path>plugins/office/**</Path>", "<Path>desktop/**</Path>"]
shared_paths: ["<Path>package.json</Path>", "<Path>package-lock.json</Path>", "<Path>.github/workflows/build.yml</Path>", "<Path>.github/workflows/ci.yml</Path>"]
shared_path_owners: ["<Path>package.json</Path> => T-21", "<Path>package-lock.json</Path> => T-21", "<Path>.github/workflows/build.yml</Path> => T-21", "<Path>.github/workflows/ci.yml</Path> => T-21"]
---

# Ticket T-21: 收敛 production 与 native packaging

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/{change}/ticket/21-converge-production-native-packaging.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/{change}/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/{change}/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/{change}/evidence/T-21.md</Path>`

## 1. 战略与来源

- **目标：** 对根依赖/lockfile/build scripts/CI 做语义并集，确保 Document Extraction native/runtime assets、Resource/History/Knowledge 与上游正常 runtime 能进入 clean install、server artifact 和 Electron production package。
- **可观察产出：** clean `npm ci`、client/server builds 与可检查的 Windows/macOS package inputs 成立；上游依赖变化完整吸收，lockfile 可重建，不靠开发机隐式依赖。
- **来源：** `US-001`、`US-007`、`US-012`、`AC-002`、`AC-003`、`AC-018`—`AC-023`、`AC-027`、`ADR-001`、`ADR-008`。
- **当前事实：** `<Path>package.json</Path>` 已定义 `dist`、`dist:win`、`dist:linux`、build/test scripts；上游 target 修改依赖、server build 与 native extraction inputs。
- **Planning Depth 原因：** lockfile、native assets、server closure、CI 和 Electron package 是共享供应链路径，失败通常只在 clean/prod 环境暴露。

## 2. 决策状态

### 已锁定决策

- `<Path>package.json</Path>` 手工做语义并集；`<Path>package-lock.json</Path>` 在源依赖确定后按仓库 npm policy 重建，禁止 ours/theirs。
- native extractor/runtime assets 必须进入 server closure 和 Windows/macOS Electron package；开发依赖不能掩盖缺失。
- Windows/macOS 是后续阻断 Gate；Linux build 可运行但非阻断。
- 本 Ticket 是根 manifests、共享 build scripts 和 CI 的唯一 owner；平台 Tickets 只添加平台专用 harness/fixtures。

### 已采用的低影响假设

- 具体 native package/asset 名称由 T-19 实际 extraction dependency inventory 决定，不虚构不存在的 converter。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| root dependencies/lock、server closure/assets、Electron build inputs、CI wiring、clean install/build smoke | existing dist/build scripts、T-19/T-20 dependency inventory | 平台原生最终 Gate、签名/发布、Linux blocking、产品逻辑修改 |

## 4. 要构建什么

从干净 checkout 安装依赖后，client、server 与 package builders 能发现并包含 extraction/runtime/native assets。Windows/macOS package 输入使用同一 dependency truth，CI 调用真实仓库 scripts。缺少 native binary/asset、dynamic dependency 或 runtime closure 时构建明确失败，而不是在发布应用中延迟崩溃。

## 5. 实现契约

- **入口或接缝：** npm install/build scripts、server closure/artifact scripts、Electron builder config in package manifest、CI workflows。
- **输入与输出：** resolved dependencies + product sources/assets → reproducible lock, client/server artifacts, platform package inputs。
- **公共接口变化：** 无产品接口；构建/发布 contract 增加 extraction/native asset verification。
- **不变量：** clean install reproducible；source manifest before lock；dev-only resolution 不进入 production；Windows/macOS inputs equal in capability。
- **状态或数据流：** dependency union → regenerate lock → build client/server → compute closure/assets → package smoke inputs。
- **错误与失败行为：** missing asset/native rebuild/closure mismatch 立即非零失败并给出可定位诊断。
- **兼容要求：** 吸收上游正常 build/security fixes；保留 HanaKDE package/runtime additions；无旧 package layout compatibility。
- **安全与隐私要求：** dependency sources/lock integrity 可审计；构建日志不输出 credentials/signing secrets。

## 6. 执行路线

1. 从 T-09/T-19/T-20 inventories 冻结 dependency/native asset/closure requirements，并建立缺失资源红色测试。
2. 对 `<Path>package.json</Path>` 做语义并集，删除重复/过时 dependency 和脚本分支。
3. 按仓库 npm policy 重建 `<Path>package-lock.json</Path>`，在 clean environment 运行 `npm ci`。
4. 更新 server/client/Electron build closure 与 asset verification，保持 Windows/macOS capability 对齐。
5. 更新 CI/shared build wiring，平台专用执行留 T-22/T-23。
6. 运行 clean install、typecheck/lint/test/build、server artifact 和 dry package-input smoke，并记录 dependency tree。

## 7. 路径访问契约

- **预计修改点：** root manifests、shared build scripts/CI 和 native rebuild test。
- **可写范围：** 仅 frontmatter `writable_paths`；product/native source只读。
- **只读上下文：** Extraction、Resource、Engine、Office、Desktop packaging consumers。
- **共享路径：** root manifests 与 shared CI；唯一 owner 全部为 T-21。
- **保留或不动：** platform-specific harness、sign/notarize/publish credentials、产品代码。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 正常路径 | clean build chain | `npm ci`、`npm run typecheck`、`npm run lint`、`npm test`、`npm run build:client`、`npm run build:server` | clean source 构建，核心合同绿色 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-21.md</Path>` |
| 失败路径 | missing asset/native injection | 暂缺/错配 extraction asset 或 native rebuild input 的 fixture test | 构建早期非零失败且诊断明确 | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-21.md</Path>` |
| 回归 | closure/package dry smoke | server artifact verify、Electron native rebuild tests、dependency inventory | runtime closure 完整，无 dev-machine hidden dep | `<Path>{roots.state}/specdev/changes/{change}/evidence/T-21.md</Path>` |

## 9. 发布、迁移与恢复

- **迁移顺序：** manifest union → lock regeneration → closure/assets → CI → platform Gates；无用户数据迁移。
- **兼容窗口：** 无旧 package layout/lock compatibility；新基线一次生效。
- **监控信号：** clean install/build status、closure diff、native rebuild/asset verification、package size/inventory。
- **回滚或前向恢复：** 回退整个 package Wave 并重新生成 lock；不混用新 manifest/旧 lock。
- **不可逆操作与批准点：** 不签名、不发布、不上传；Git commit/merge 与任何外部 CI 写入需明确授权。
- **收缩条件：** duplicate dependencies/scripts、missing runtime assets、manifest-lock drift 为零。

## 10. 验收标准

- [ ] `AC-002`/`AC-003`：clean build/test 同时覆盖上游正常行为和 HanaKDE contracts。
- [ ] `AC-018`—`AC-023`：Extraction/Office/Materialize/Transfer runtime inputs 完整进入 production artifacts。
- [ ] `AC-027`：Windows/macOS package inputs 和执行命令就绪；Linux 不成为阻断依赖。
- [ ] root manifest/lock/shared CI 仅由 T-21 修改且可重建。
- [ ] 验证记录到 `<Path>{roots.state}/specdev/changes/{change}/evidence/T-21.md</Path>`。
