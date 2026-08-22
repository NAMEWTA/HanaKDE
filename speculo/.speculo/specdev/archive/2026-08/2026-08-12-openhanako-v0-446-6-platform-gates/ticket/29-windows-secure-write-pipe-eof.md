---
schema_version: 3
artifact: ticket
change: 2026-08-12-openhanako-v0-446-6-platform-gates
id: T-29
title: 修复 Windows secure-write helper 的 stdin EOF 处理
status: done
planning_depth: deep
planning_depth_reason: "Windows native helper 与 Node child pipe 的 EOF 错误码交界会把成功写入误报为 503，直接影响 Knowledge Resource convergence。"
ready: true
risk: critical
blocked_by: [T-27, T-28]
contract_ids: [AC-015, AC-017, AC-023, AC-027, AC-030]
owner: secure-write-owner
expected_changes: ["<Path>desktop/native/HanaSecureFsHelper/main.cpp</Path>", "<Path>tests/secure-fs-helper-build.test.ts</Path>"]
writable_paths: ["<Path>desktop/native/HanaSecureFsHelper/main.cpp</Path>", "<Path>tests/secure-fs-helper-build.test.ts</Path>"]
read_only_paths: ["<Path>package.json</Path>", "<Path>package-lock.json</Path>", "<Path>lib/resource-io/**</Path>", "<Path>server/**</Path>"]
shared_paths: []
shared_path_owners: []
---

# Ticket T-29: 修复 Windows secure-write helper 的 stdin EOF 处理

## 1. 战略与来源

真实 Windows Knowledge write 返回 503，helper stderr 显示
`read-fail win32=109`。Win32 用 `ERROR_BROKEN_PIPE` 表示 Node 关闭 child stdin
后的正常 EOF；目标是只在请求读取位置正确处理该语义。

## 2. 决策状态

已锁定：只把请求帧 `ReadFile` 的 `ERROR_BROKEN_PIPE` 当 EOF；其他错误继续
fail closed；不改 frame、root identity、expected-version、响应协议或 ResourceIO。
无未决问题。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| Win32 helper EOF 分支与 build contract | 既有 native protocol、ResourceIO、Knowledge flow | 协议重构、依赖、lockfile、发布 |

## 4. 要构建什么

在 `readAll` 中接受错误码 109 的正常 EOF，并增加直接源码合同断言。

## 5. 实现契约

- **入口：** helper 从 stdin 读取完整请求帧的循环。
- **不变量：** root revalidation、expected-version 和所有非 EOF 错误保持严格。
- **失败行为：** malformed/other Win32 errors 仍返回失败；不得吞掉通用 I/O 错误。

## 6. 执行路线

1. 记录 native 109 红灯并增加失败 contract。
2. 实现最窄 EOF 分支并重建 helper。
3. 运行 secure write/Knowledge/final Windows matrix。
4. 通过正式 package、installed direct flow 和 repair 后写 Evidence。

## 7. 路径访问契约

只写 helper source 与其 build contract；ResourceIO、server、依赖和 lockfile 只读。

## 8. 验证矩阵

| 风险 | 验证接缝 | 预期 |
|---|---|---|
| 正常 EOF 误报 | helper contract/native flow | 不再返回 503 |
| 错误放宽过度 | source contract | 仅 `ERROR_BROKEN_PIPE` 分支接受 |
| package 漏装 | `dist:win`/Windows gate | x64 helper 在 signed seed 中 |
| E2E 回归 | installed direct flow | Workspace/Office/Agent/`@` 与 cleanup 通过 |
| E2E disposition | `required`；`current-workspace` / `direct-parent` Windows x64 installed flow | 真实 secure-write/Knowledge convergence 通过 |

## 9. 发布、迁移与恢复

无协议迁移或发布动作。若其他错误码出现，先分类并新增红测试，不扩张 EOF 白名单。

## 10. 验收标准

- [x] AC-015/017/023：写入、恢复和 Knowledge convergence 通过。
- [x] AC-027/030：正式 package 含修复 helper，启动与 repair 通过。
- [x] 只触碰 writable paths，lock/dependency/release 无变化，Evidence 完整。
