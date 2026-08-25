# Evidence: Direct Spec — 修复 Todo 插件 Page 加载与鉴权

- **Change：** `2026-08-24-fix-todolist-plugin-loading`
- **Ticket：** 不适用；用户批准的 Direct Spec
- **Spec：** `<Path>speculo/.speculo/specdev/changes/2026-08-24-fix-todolist-plugin-loading/spec.md</Path>`
- **Goal Plan：** 不适用
- **Lead：** `root`
- **Workspace/branch：** current workspace `/Users/wta/Documents/01-Code/myCode/HanaKDE` / `hanakde`
- **实施前基线：** `b59ab7496379ab1de5c92d6a5dde353ef01f119b`
- **最终 checkpoint：** implementation commit `0003a6734faddb170a9c06aa8a2fd282cef6becf`；`plugins/todolist/assets/page.js` SHA-256 为 `33db7facae788f2029e8919a0d94267abf50d20e87ccc1bc417257bfe2e54d96`
- **状态：** completed；本地、宿主合同与真实 HanaKDE E2E 全部通过

## 1. 实现摘要

Todo Page 入口显式注入官方 `@hana/plugin-sdk`。DOM 应用不再读取 `window.hana` 或退化为普通 fetch；页面壳渲染后立即通过 SDK 发出 ready，API 统一由 SDK 注入 surface-session header，resize 与 Resource Picker 也使用正式 SDK 合同。构建工具链缺失时直接失败，不再生成无鉴权 fallback bundle。

## 2. Lead Dispatch And Candidate Return

- **Implementation owner：** Lead
- **Dispatch Packet/checkpoint：** Lead direct；实施前基线 `b59ab7496379ab1de5c92d6a5dde353ef01f119b`
- **允许动作：** current workspace 内 `<Path>plugins/todolist/**</Path>` 产品写入与本 change Speculo 工件写入；用户随后授权 commit、push 和 HanaKDE v0.0.4 release
- **返回：** 修改路径见第 3 节；全部验证见第 5 节，提交与发行由后续独立 release change 承接
- **Lead 独立核对：** pass；重读 diff、构建产物、插件测试与宿主 iframe 合同测试
- **只读 Agent findings：** 无；Direct Spec 未派遣 subagent

## 3. 修改范围与路径所有权

| 路径 | 所有权 | 改动目的 |
|---|---|---|
| `<Path>plugins/todolist/src/ui/**</Path>` | writable:Lead | 注入 SDK、修复 ready/API/resize/Resource Picker 生命周期 |
| `<Path>plugins/todolist/tests/**</Path>` | writable:Lead | 新增生命周期与鉴权回归，收紧真实宿主 401/403 断言 |
| `<Path>plugins/todolist/build.ts</Path>`、`<Path>plugins/todolist/scripts/verify-package.mjs</Path>` | writable:Lead | 构建 fail closed 与 bundle 协议检查 |
| `<Path>plugins/todolist/assets/page.js</Path>` | generated:Lead | 由 `npm run build` 从 Page 源码生成 |
| `<Path>plugins/todolist/package.json</Path>`、`<Path>plugins/todolist/manifest.json</Path>`、`<Path>plugins/todolist/CHANGELOG.md</Path>`、`<Path>plugins/todolist/types/external.d.ts</Path>` | writable:Lead | 0.2.1 元数据、SDK 依赖、变更记录与测试类型 |
| `<Path>speculo/.speculo/specdev/changes/2026-08-24-fix-todolist-plugin-loading/**</Path>` | state-owner:Lead | Direct Spec、诊断与 Evidence |
| `<Path>speculo/.speculo/specdev/status.json</Path>` | shared:Speculo owners | 仅追加本 change active 索引 |

- **read-only 修改：** 无
- **未声明路径：** 无
- **生成文件/锁文件：** `assets/page.js` 已重建；根锁文件未改

## 4. 验收与合同映射

| Contract / Acceptance ID | 验证接缝 | 证据 | 结果 |
|---|---|---|---|
| DS-001 | Page 生命周期与 bundle 协议 | `ui-host.test.ts` 立即 ready；package smoke 包含正式 `hana.ready` 且排除 `hana:ready`；宿主 iframe 合同 8/8 | pass |
| DS-002 | SDK API 鉴权 | `ui-host.test.ts` 证明所有首屏 API 只走注入 SDK；bundle 含 `X-Hana-Plugin-Surface-Session`；真实 E2E 无 401/403 | pass |
| DS-003 | 既有 CRUD | 插件完整 Node 回归 30/30；真实 HanaKDE desktop/narrow 五语言 CRUD 12/12 | pass |
| DS-004 | 数据失败时仍退出宿主 loading | 页面壳与 ready 在未决 API Promise 前可观察；错误仍由既有 catch/render 呈现 | pass |
| DS-005 | 插件回归 | typecheck、30 tests、build、JS check、package smoke 全部通过 | pass |

## 5. Workspace Verification

| 命令或步骤 | 运行环境 | 结果 | 摘要 |
|---|---|---|---|
| `node --experimental-strip-types --test tests/ui-host.test.ts`（实现前） | current-workspace/plugin | fail-as-expected | ready `0 !== 1`；global fetch `3 !== 0` |
| `npm run verify` | current-workspace/plugin | pass | typecheck；30/30 tests；bundle 1,163,198 bytes；16 tools/19 entrypoints package smoke |
| `npx vitest run desktop/src/react/__tests__/hooks/use-plugin-iframe.test.tsx desktop/src/react/__tests__/components/PluginPageView.test.tsx` | current-workspace/root | pass | 2 files、8 tests |
| `npm run test:e2e` | HanaKDE dev host `127.0.0.1:37453` / isolated `~/.hanako-dev` | pass | desktop/narrow、五语言 CRUD 与 capture 合同 12/12；无 401/403 |
| `git diff --check -- plugins/todolist ...` | current-workspace/root | pass | 无 whitespace error |
| `validate-specdev.mjs --stage diagnosis` | current-workspace/root | pass | 0 errors、0 warnings |

- **失败后修复与重跑：** 除 SDK/Picker 修复外，真实 E2E 发现快速记录在 Today 中创建无日期 Todo 后不可见，以及窄屏导航未关闭详情；已修复视图切换和详情保持，并修正 input value/响应式可见性的错误 E2E 断言后全绿。
- **运行数据清理：** E2E 前快照隔离的 `~/.hanako-dev/plugin-data/todolist`，关闭 HanaKDE 实例后完整恢复；正式 `~/.hanako/plugin-data/todolist` 未修改。
- **E2E：** required / passed；owner 为 Lead，测试入口为 `<Path>plugins/todolist/tests/e2e/real-host.spec.ts</Path>`。

## 6. 双轴审查

### 标准轴

- **固定输入：** 基线 `b59ab7496379ab1de5c92d6a5dde353ef01f119b` 与 current workspace Todo 插件 diff
- **结果：** pass
- **Findings 与修正：** 正式 Picker 输入应为 `mode` 且结果为 `resources[]`，已修正；未声明的 host toast 可能异步拒绝，已移除并保留页内 toast。

### 规范轴

- **固定输入与来源：** `source.md`、`diagnosis.md`、`spec.md` 与用户“按计划进行实施”授权
- **结果：** pass
- **Findings 与修正：** 改动保持在 Todo 插件及 change-owned Speculo 工件内；全局 status 仅追加 active 索引；未修改 Store 数据、routes/tools、宿主或根锁文件。

## 7. Integration Verification

| 项目 | 结果 |
|---|---|
| Parent before SHA | `b59ab7496379ab1de5c92d6a5dde353ef01f119b` |
| Implementation/source SHA | `0003a6734faddb170a9c06aa8a2fd282cef6becf` |
| Candidate branch/workspace | current |
| Method/conflicts | Direct Spec current workspace；无 integration merge |
| Integration checks | 插件 `npm run verify` 与宿主 iframe Vitest 均在 current workspace 通过 |
| E2E disposition | required；验证真实 HanaKDE 插件 Page |
| E2E result | passed；desktop/narrow 五语言 12/12，无 401/403 |
| Parent result/re-read | Direct-parent result `0003a6734faddb170a9c06aa8a2fd282cef6becf`；后续 `e64e45ae` 与当前 HEAD 仅为发行/文档祖先，均包含该实现提交 |

## 8. 偏差与决策

- **偏差：** 无
- **记录：** 不适用
- **批准来源及影响：** 用户批准实施，并在 2026-08-25 明确授权完成后 commit、push 和 release v0.0.4

## 9. 残余风险与交付定位

- **残余风险/已知限制：** 正式兼容目录中的旧 `0.2.0` 插件代码已备份但未直接覆盖；HanaKDE v0.0.4 将携带已验证的内置 `0.2.1`。
- **后续 Ticket：** 无；发布由独立 v0.0.4 release change 承接。
- **监控或回滚触发：** E2E 出现 401/403、ready 超时或 CRUD 失败时回滚内置插件资产；Todo Store 位于独立 data 目录且本次未修改。
- **Source commit：** `0003a6734faddb170a9c06aa8a2fd282cef6becf`
- **Parent result：** `0003a6734faddb170a9c06aa8a2fd282cef6becf`
- **Source workspace：** `/Users/wta/Documents/01-Code/myCode/HanaKDE`
- **Evidence：** `<Path>speculo/.speculo/specdev/changes/2026-08-24-fix-todolist-plugin-loading/evidence/direct-spec.md</Path>`
