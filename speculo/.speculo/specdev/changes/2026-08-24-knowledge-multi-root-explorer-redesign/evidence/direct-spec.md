# Evidence: Direct Spec - Knowledge 多根 Explorer 与工作台树行统一

- **Change：** `2026-08-24-knowledge-multi-root-explorer-redesign`
- **Ticket：** 不适用；用户批准的 Direct Spec
- **Spec：** `<Path>speculo/.speculo/specdev/changes/2026-08-24-knowledge-multi-root-explorer-redesign/spec.md</Path>`
- **Goal Plan：** 不适用
- **Lead：** `root`
- **Workspace/branch：** current workspace `/Users/wta/Documents/01-Code/myCode/HanaKDE` / `hanakde`
- **实施前基线：** `b59ab7496379ab1de5c92d6a5dde353ef01f119b`
- **最终 checkpoint：** implementation commit `18310e5e7afef6a392b4786a8ab2269cb298d059`
- **状态：** completed；Node 24 Knowledge E2E、Direct Spec validator 与完成门均已通过

## 1. 实现摘要

Knowledge 删除独立 Sources 栏，把 `main` 与 mounted sources 作为同一 Explorer 的一级兄弟根，显式保持 main 首位并显示 DTO 的真实 `displayName`。新增无状态 `WorkspaceTreeRow`，由 DeskTree 和 KnowledgeResourceTree 共同消费；行高、缩进、disclosure、截断以及 HanaKDE 既有 `ICONS/getFileIcon` 统一复用，双方原有状态、I/O 和交互控制器保持独立。56rem 与 38rem 响应式布局收敛为 Search、Explorer、Editor、Views、Status 单列顺序。

## 2. Lead Dispatch And Candidate Return

- **Implementation owner：** Lead
- **Dispatch Packet/checkpoint：** Lead direct；实施前基线 `b59ab7496379ab1de5c92d6a5dde353ef01f119b`
- **允许动作：** current workspace 内受影响 Desktop Renderer、Knowledge E2E 和本 change Speculo 工件写入；用户已授权 commit、push 和 `v0.0.2` release；不重建本地依赖或清理原型 worktree
- **返回：** 产品实现已提交为 `18310e5e7afef6a392b4786a8ab2269cb298d059`；工作区仍保留不属于本 change 的用户改动；测试、视觉证据与未验证项见第 3、5、9 节
- **Lead 独立核对：** pass-local；重读产品 diff、组件测试、响应式样式、截图指标和 Spec 合同
- **只读 Agent findings：** 无；Direct Spec 未派遣 subagent

## 3. 修改范围与路径所有权

| 路径 | 所有权 | 改动目的 |
|---|---|---|
| `<Path>desktop/src/react/components/shared/WorkspaceTreeRow.*</Path>` | writable:Lead | 提取 Desk/Knowledge 共用的纯树行 Renderer 与样式 token |
| `<Path>desktop/src/react/components/desk/DeskTree.tsx</Path>`、`<Path>desktop/src/react/components/desk/Desk.module.css</Path>` | writable:Lead | Desk 适配共享行并删除重复树行 CSS；业务交互不变 |
| `<Path>desktop/src/react/components/knowledge-workspace/KnowledgeLayout.tsx</Path>`、`<Path>KnowledgeResourceTree.tsx</Path>`、`<Path>KnowledgeWorkspace.module.css</Path>` | writable:Lead | 单 Explorer、多根投影、真实主根名与响应式布局 |
| `<Path>desktop/src/react/__tests__/components/*Knowledge*.test.tsx</Path>`、`<Path>DeskSection.test.tsx</Path>`、`<Path>WorkspaceTreeRow.test.tsx</Path>` | writable:Lead | 多根顺序、共享 Renderer 和既有交互回归 |
| `<Path>tests/knowledge-workspace-e2e/specs/E2E-KW-001-shell.spec.ts</Path>` | writable:Lead | 单 Explorer 与窄屏无溢出合同 |
| `<Path>speculo/.speculo/specdev/changes/2026-08-24-knowledge-multi-root-explorer-redesign/**</Path>` | state-owner:Lead | 原型、Direct Spec、截图与 Evidence |
| `<Path>speculo/.speculo/specdev/status.json</Path>` | shared:Speculo owners | 仅维护本 change active/current-work 索引 |

- **read-only 修改：** 无
- **未声明路径：** 工作区已有 Todo、Finance 和其他用户改动不属于本 change，未修改、回退或纳入验证结论
- **生成文件/锁文件：** Evidence PNG 已由路由隔离的 Playwright 视觉脚本生成；无锁文件改动

## 4. 验收与合同映射

| Contract / Acceptance ID | 验证接缝 | 证据 | 结果 |
|---|---|---|---|
| AC-001 | KnowledgeWorkspace / ResourceTree | 组件测试断言单 tree、main/mounted 同级且 main 首位；桌面指标 `treeCount=1`、根名顺序正确 | pass-local |
| AC-002 | KnowledgeLayout | 组件测试输入 `Main workspace` 并断言不再显示强制 `Working directory` | pass-local |
| AC-003 | Shared Renderer / Desk / Knowledge | 三组测试均断言 `data-workspace-tree-row`；截图测得行高集合仅 `[28]`；继续使用 `ICONS/getFileIcon` | pass-local |
| AC-004 | 来源状态 | 既有 loading/error/retry/unavailable 组件回归通过，状态移动到 Explorer 内 | pass-local |
| AC-005 | 600x720 窄窗口 | `production-narrow.png`；`horizontalOverflow=false`；Node 24 desktop E2E-KW-023 通过五语言、主题、窄屏与可访问性检查 | pass |
| AC-006 | 选择/键盘/拖拽/打开 | Knowledge tree integration/keyboard 与 DeskSection 定向回归 31/31；Node 24 desktop E2E-KW-015 通过 | pass |

## 5. Workspace Verification

| 命令或步骤 | 运行环境 | 结果 | 摘要 |
|---|---|---|---|
| TDD: Knowledge 单 Explorer / shared row / Desk-Knowledge marker（实现前） | current-workspace | fail-as-expected | 旧 Sources region 存在；共享 Module/marker 尚不存在 |
| `npx vitest run` 6 个受影响组件测试（排除 `specdev-worktree/**`） | current-workspace | pass | 6 files、50/50 tests |
| `npx vitest run tests/style-discipline.test.ts --exclude 'specdev-worktree/**'` | current-workspace | pass | 8/8；新增文件无裸 spacing/color/duration 违例 |
| `npm run typecheck` | current-workspace | pass | Renderer、Node 与 test 三套 tsconfig 全部通过 |
| 目标文件 `npx eslint ...` | current-workspace | pass | 0 errors；`DeskSection.test.tsx` 有 2 条既有 warning |
| `npm run lint:boundary` | current-workspace | pass | 0 个新增 open-to-closed 边界 |
| `npm run build:renderer` | current-workspace | pass | Vite 3131 modules；仅既有 script/chunk warning |
| 路由隔离 Playwright desktop/narrow 截图 | current-workspace, `http://127.0.0.1:5173/index.html` | pass | 单树、双根、28px 行高；桌面/窄屏均无横向溢出 |
| `git diff --check` | current-workspace | pass | 无 whitespace error |
| `volta run --node 24.16.0 npm run test:knowledge:e2e:desktop -- E2E-KW-001-shell.spec.ts` | current-workspace / Node 24.16.0 ABI 137 | pass | E2E-KW-001 与 E2E-KW-023，2/2 passed |
| `volta run --node 24.16.0 npm run test:knowledge:e2e:open -- E2E-KW-001-shell.spec.ts` | current-workspace / Node 24.16.0 ABI 137 | pass | E2E-KW-001 passed；desktop-only E2E-KW-023 按项目条件 skipped |
| `volta run --node 24.16.0 npx playwright test -c tests/knowledge-workspace-e2e/playwright.config.ts --project=desktop-full E2E-KW-014-024-resource-operations.spec.ts --grep E2E-KW-015` | current-workspace / Node 24.16.0 ABI 137 | pass | 键盘、范围选择、上下文、排序、预览与 reveal，1/1 passed |
| `npm test` | current-workspace | not-a-reliable-gate | retained prototype worktree 被重复收集，另含 native ABI 与外部 suite；2480 files，24220 pass / 513 fail / 16 skip |
| `npm run lint` | current-workspace | not-a-reliable-gate | 递归进入 retained worktree 及其 `node_modules` symlink；41641 problems；目标 ESLint 单独通过 |

- **失败后修复与重跑：** 共享 CSS 初次触发 2 个 bare-spacing 与 2 个 hardcoded-color；改为仓库 spacing token 和 `color-mix` 后 style-discipline 8/8，并重跑组件、类型、构建和视觉验证。
- **未运行检查：** 无合同要求的未运行检查；web-open 的 E2E-KW-023 按测试自身 desktop-only 条件跳过，不是缺失验证。
- **E2E：** required / passed；owner 为 Lead，使用本机已有 Volta Node 24.16.0 与 ABI 137 的 `better-sqlite3`，未安装或重建依赖。
- **视觉证据：** `<Path>evidence/assets/production-desktop.png</Path>` SHA-256 `44a95e1e1da2029b7eba8f7d86631576f62539c1ebff492a7d34e183dc01816b`；`<Path>evidence/assets/production-narrow.png</Path>` SHA-256 `0452fbf4d55f7710098c4c08b76ef04f30e4af9327bd607a539ff154db5ca7c2`。

## 6. 双轴审查

### 标准轴

- **固定输入：** `b59ab7496379ab1de5c92d6a5dde353ef01f119b..18310e5e7afef6a392b4786a8ab2269cb298d059`
- **结果：** pass-local
- **Findings 与修正：** Desk 原树行 CSS 在适配共享 Renderer 后成为重复死样式，已删除；共享样式字面量触发 ratchet，已 token 化并重跑验证。共享 Module 无 effect/store/client，图标 markup 仅来自既有受控常量。

### 规范轴

- **固定输入与来源：** `source.md`、`feature-placement.md`、`PROTO-001/record.md`、`spec.md` 与用户实施授权
- **结果：** pass-local
- **Findings 与修正：** 改动留在系统本体 `desktop/`，没有修改插件、SourceRegistry、DTO、ResourceIO、server、store 或持久化；生产代码未带入原型 variant/switcher；IN/OUT 和六项 AC 均有本地证据。

## 7. Integration Verification

| 项目 | 结果 |
|---|---|
| Parent before SHA | `b59ab7496379ab1de5c92d6a5dde353ef01f119b` |
| Implementation/source SHA | `18310e5e7afef6a392b4786a8ab2269cb298d059` |
| Candidate branch/workspace | current |
| Method/conflicts | Direct Spec current workspace；无 integration merge |
| Integration checks | 定向 Vitest、style discipline、typecheck、目标 ESLint、boundary、renderer build、视觉检查均通过 |
| E2E disposition | required |
| E2E result | passed；desktop shell/narrow 2/2、web-open shell 1/1、desktop E2E-KW-015 1/1 |
| Parent result/re-read | `hanakde` HEAD 包含 implementation commit `18310e5e7afef6a392b4786a8ab2269cb298d059` |

## 8. 偏差与决策

- **偏差：** 无产品或 Spec 偏差
- **记录：** 修复 SpecDev validator，使 `ready_for_tickets:false` 且没有 Ticket 的 Direct Spec 不再错误要求 Ticket contract coverage；stage implement 已通过，未创建伪 Ticket或删除 AC。
- **批准来源及影响：** 用户已批准计划、实施、commit、push 与 `v0.0.2` release；未授权原型来源清理或本地依赖重建

## 9. 残余风险与交付定位

- **残余风险/已知限制：** web-open 不运行 desktop-only 窄屏/主题场景；该场景已由 desktop-full E2E 与生产截图覆盖。
- **后续 Ticket：** 无。
- **监控或回滚触发：** 后续回归若出现来源顺序、ResourceIO payload、键盘/拖拽或打开行为退化，则以 implementation commit `18310e5e` 为固定点诊断。
- **Prototype source：** 原 locator `speculo/2026-08-24-knowledge-multi-root-explorer-redesign/prototype-PROTO-001` / `<Path>specdev-worktree/prototype-knowledge-multi-root-explorer</Path>`；完成审计时 branch 与 worktree 已不存在，本次未执行清理动作。
- **Source commit：** `18310e5e7afef6a392b4786a8ab2269cb298d059`
- **Parent result：** `18310e5e7afef6a392b4786a8ab2269cb298d059`
- **Source workspace：** `/Users/wta/Documents/01-Code/myCode/HanaKDE`
- **Evidence：** `<Path>speculo/.speculo/specdev/changes/2026-08-24-knowledge-multi-root-explorer-redesign/evidence/direct-spec.md</Path>`
