---
schema_version: 3
artifact: tickets-map
change: 2026-08-27-macos-release-team-id-crash
status: done
---

# Tickets Map: 实验版无证书跨平台发行

- **Map：** `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/tickets-map.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/spec.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/evidence/</Path>`

## 1. 目标与拆分策略

两个纵向切片共同交付 `US-001`—`US-004`。T-01 先让所有构建入口无法使用平台身份并证明内部 seed 边界仍健康；T-02 再以最终用户路径判决未经重签的真实 macOS/Windows 产物，并把门接到上传前。该顺序避免先改 E2E harness 却仍消费旧 hardened/Developer ID 双模式，也避免平台验证与供应链收缩混在单个上下文。

## 2. 执行清单

| ID | Ticket | 可观察产出 | Blocked By | Depth | Risk | Ready | Owner | Contract IDs | Wave/Gate | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 | `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/ticket/01-converge-credential-free-packaging.md</Path>` | 无平台身份的 shell/seed 构建边界，内部 artifact 签名保持 | — | deep | high | yes | root | AC-003、AC-006—AC-008 | Gate A | done |
| T-02 | `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/ticket/02-gate-untouched-platform-artifacts.md</Path>` | 原始 macOS/Windows 包在上传前按用户路径启动成功 | T-01 | deep | high | yes | root | AC-001—AC-002、AC-004—AC-005、AC-009—AC-010 | Gate B | done |

## 3. 依赖 DAG

```text
T-01 [DONE: 0e6bfc40]
  -> Gate A: static/seed integrity contracts pass
  -> T-02 [DONE: v0.0.7 four-platform Build passed at 24705bb2]
       -> Gate B: mac arm64/x64 + Windows raw E2E pass
       -> implementation complete; release remains separately unauthorized
```

关键路径是 `T-01 -> T-02`；没有可并行 implementation Ticket。

## 4. 合同覆盖矩阵

| Contract ID | 覆盖 Ticket | 验证接缝 | 状态 | 说明 |
|---|---|---|---|---|
| AC-001 | T-02 | raw arm64 DMG + quarantine clear + main-loaded | covered | 禁止二次重签 |
| AC-002 | T-02 | raw x64 DMG/Rosetta flow | covered | required E2E |
| AC-003 | T-01、T-02 | config contract + fallback Gate | covered | true unsigned 优先 |
| AC-004 | T-02 | harness API/hash contract | covered | 删除 adhoc-resign |
| AC-005 | T-02 | Authenticode status + Windows direct flow | covered | 必须 NotSigned |
| AC-006 | T-01 | repository/CI forbidden-entry scan | covered | 保留 no-sign guard 与内部签名 allowlist |
| AC-007 | T-01 | darwin seed ad-hoc + Node smoke | covered | 删除 Developer ID 双模式 |
| AC-008 | T-01、T-02 | artifact/seed verify + regression | covered | 内部签名保持 fail closed |
| AC-009 | T-02 | workflow dependency contract | covered | platform gates precede upload |
| AC-010 | T-02 | README/doc scan | covered | 用户步骤准确 |

## 5. 并行与路径所有权

- 两个 Ticket 均触及安全/发布边界，采用 current workspace 严格串行，不并行写入。
- T-01 完成后 `<Path>tests/ci-workflow-guards.test.ts</Path>` 的后续所有权交给 T-02；T-01 不再修改该 shared path。
- Lead 拥有 SpecDev 状态、Evidence、最终平台 E2E 与父分支验证。
- 未创建 Goal Plan；两个线性 Ticket 的依赖、Gate 和恢复点已由本 Map 与 Ticket 决策完备表达。

| Ticket A | Ticket B | Writable 交集 | 真实依赖 | 处理 |
|---|---|---|---|---|
| T-01 | T-02 | `<Path>tests/ci-workflow-guards.test.ts</Path>` | 是 | T-02 blocked_by T-01；T-02 是最终 owner |

## 6. Gate、Wave 与集成点

- **Gate A：** T-01 focused contracts、darwin seed ad-hoc startup smoke、seed signature verification 和 tamper rejection 全部通过；Developer ID/entitlements/sign-local 扫描为零。
- **Gate B：** freshly built macOS arm64/x64 DMG 未重签启动通过，Windows installer 为 NotSigned 且安装/启动通过，CI 上传依赖边与文档合同通过。
- **集成点：** 每个 Ticket 形成独立 implementation commit；Lead 在 current workspace 运行 direct-parent checks 后记录 result SHA。T-02 只有 required 平台 E2E 全部通过才可 done。

## 7. 横切契约与风险

- 系统发行身份与内部 artifact crypto 严格分层；禁止通过删除 `.sig` 或 verification 代码简化实验构建。
- macOS true unsigned -> ad-hoc 是条件分支，不是两个长期发行模式；最终只保留实际通过所有 Gate 的一个配置。
- `xattr`/SmartScreen 是用户风险确认，不是来源可信证明。
- 历史 archive、旧 release digest、传递依赖和非签名用途的 HanaAgent 兼容名称不纳入零扫描。
- tag、push、Release upload 没有从本计划获得授权。

## 8. 同步规则

- Ticket 状态变化后同步执行清单；Ticket frontmatter 是权威。
- T-01 Gate A 未关闭时不得开始 T-02；T-02 required E2E 缺任一平台时保持 blocked。
- true unsigned 失败只有匹配 Spec 中限定原因时才可切换 ad-hoc；否则记录 deviation 并返回 Spec。
- 依赖、合同覆盖或路径所有权变化后重跑 SpecDev validator。
