---
schema_version: 1
artifact: diagnosis
change: 2026-08-12-knowledge-workspace-resource-convergence
status: root-cause-confirmed
feedback_loop_ready: true
red_command: npm test -- --run tests/knowledge-workspace-route.test.ts tests/resource-io-route.test.ts tests/knowledge-create-service.test.ts
red_evidence: tests/knowledge-workspace-route.test.ts reports 5 stable failures with 503/unavailable in default Engine/resource setup; resource-io and create service controls pass
cleanup_status: clean
updated_at: 2026-08-12T11:52:00+08:00
---

# Diagnosis: Knowledge 工作区资源操作不可用与资源树交互缺口

## 1. 现象与影响

Knowledge 编辑保存、新建页面、新建文件夹后的后续操作和删除 commit 在真实工作目录场景中返回 `knowledge_resource_unavailable` 503；重复点击未关闭的创建弹窗可再次提交并返回 `knowledge_resource_conflict` 409；剪切/粘贴与资源树右键文件操作不完整。影响所有以当前工作目录作为 Knowledge `main` 的写入用户，严重度为 critical。

## 2. 红灯反馈回路

- **命令：** `npm test -- --run tests/knowledge-workspace-route.test.ts tests/resource-io-route.test.ts tests/knowledge-create-service.test.ts`
- **至少一次真实输出：** `tests/knowledge-workspace-route.test.ts (26 tests | 5 failed)`；失败包括 `keeps a newly mounted source bound through a source-scoped rebuild` 503、delete/restore commit 503、native trash/import 流程 503；`tests/resource-io-route.test.ts (66 tests)` 与 `tests/knowledge-create-service.test.ts (3 tests)` 通过。仓库内 `specdev-worktree/T-22-audit` 镜像套件另有独立的 `node_modules/node_modules/@earendil-works/pi-coding-agent` 解析错误，未改变实际 route 红灯。
- **精确症状断言：** 失败响应状态为 503 或结果项 `errorCode: knowledge_resource_unavailable`，与用户报告完全一致；成功控制用例要求显式 `engine.resourceIO` 注入后文件事实可写入/回收。
- **耗时：** 约 4.14 秒。
- **确定性/复现率：** 默认 Engine/resource 夹具下确定性复现；显式注入匹配工作目录的 ResourceIO 后相关控制用例通过。
- **Agent 可运行性：** autonomous。
- **无法建立时已尝试方式和所需输入：** 不适用。

## 3. 最小复现

- **环境与输入：** `tests/knowledge-workspace-route.test.ts` 的 `setup()` 创建 `main` 临时目录并只配置 `defaultDeskCwd/homeCwd/deskCwd`；Knowledge registry 由 `resolveWorkbenchCompatibilityMain()` 解析该目录；Engine 未注入与该目录绑定的 `resourceIO` 时，写入/创建/Trash coordinator 走另一 ResourceIO owner。
- **剩余步骤：** 1. 以 `main` 作为 Knowledge source；2. 通过 Knowledge ResourceIO 或 create/operation route 执行写入；3. 观察 503；4. 为 Engine 注入同根 `ResourceIO` 后重跑，观察控制用例变绿。
- **逐项删除证据：** 删除 UI、索引和挂载步骤仍保留 ResourceIO 503；删除 Knowledge 地址解析并不能满足用户路径合同；替换为显式同根 ResourceIO 后相关写入/删除用例通过，说明根绑定是负载项。
- **最后红灯证据：** 默认 setup 的删除 commit 在 `tests/knowledge-workspace-route.test.ts:960` 收到 503；native import 替换结果在 `:1294` 为 `ok:false,errorCode:knowledge_resource_unavailable`。
- **捕获物：** 无；命令输出已持久化为本诊断摘要。

## 4. 假设与证伪

| 排名 | 假设与预测 | 支持证据 | 单变量实验 | 结果 |
|---|---|---|---|---|
| 1 | Knowledge registry 使用的活动 `main` 根与 ResourceIO/provider owner 不一致；若把 Engine ResourceIO 绑定到同一根，写入/删除 503 消失。 | `server/routes/knowledge-workspace.ts` 的 registry 创建独立 sandbox；`resource-io.ts` 消费 `engine.resourceIO/getResourceIO()`；显式注入同根 ResourceIO 的测试通过。 | 只给 Engine 注入以 `main` 为 cwd 的 `ResourceIO`，重跑写入/Trash/native import。 | 确认；控制用例变绿，默认 owner 不匹配时保持红灯。 |
| 2 | 503 主要由创建服务名称校验或 expected version 语义触发。 | `knowledge-create-service.test.ts` 三项通过；用户保存已有文件也失败。 | 只替换合法文件名/expectedVersion，保持 owner 不变。 | 排除；不能消除统一 503。 |
| 3 | Operation Journal/恢复屏障未完成导致所有 mutation 503。 | route 在生产 composition 前显式 `prepareKnowledgeOperationRecovery()`；部分 rename/copy 测试通过。 | 只注入已恢复 coordinator，保持 ResourceIO owner 不变。 | 排除为主因；仍在 resource service 访问时失败。 |
| 4 | UI 重复提交是 409 的唯一原因。 | 创建服务对已存在目标稳定返回 conflict；弹窗当前 `onCreated(); onClose()` 顺序存在可重入窗口。 | 只在成功回调前锁定 submit 并验证 modal unmount。 | 这是独立 UI 缺陷，不能解释 503。 |

## 5. 已确认根因

- **触发条件：** 当前活动工作目录被 Knowledge registry 解析为 `main`，但 Engine 的公开 `ResourceIO` owner 仍由默认初始化路径或用户目录创建，未随活动工作根切换同步。
- **失败机制：** Knowledge 地址解析成功后，`KnowledgeCreateService`、Trash/Atomic coordinator 和 `/api/resource-io/write-expected-version` 将 ResourceRef 交给不同或无权限的 provider scope；provider 以不可用/不匹配方式失败，错误被稳定归一化为 `knowledge_resource_unavailable` 503。
- **根因位置：** `<Path>server/routes/knowledge-workspace.ts</Path>` 的 `createRegistryEntry()`/`resourceIoFor()`/`createOperationEntry()` 与 `<Path>core/engine.ts</Path>` 的 `getResourceIO()` 生命周期之间缺少活动工作根单一 owner 绑定；UI 缺口位于 `<Path>desktop/src/react/components/knowledge-workspace/KnowledgeResourceTree.tsx</Path>` 与 `<Path>desktop/src/react/components/knowledge-workspace/KnowledgeLayout.tsx</Path>`。
- **漏检原因：** 既有单元测试以 mock ResourceIO 验证服务契约；route tests 的成功 mutation 多数显式注入 ResourceIO，未覆盖“切换活动工作根后公开 facade 与 Knowledge registry 仍同根”的生产 composition 回归。创建弹窗测试只断言 callback，没有断言成功后 dialog 关闭和重复提交屏障。
- **为何排除其他候选：** 合法命名、expected version、Journal recovery 与 capability 校验均有独立绿灯或非统一影响；只有同根 ResourceIO owner 变量能同时解释保存、创建、删除和 native import 失败。
- **确认实验：** 在同一 route fixture 中只注入 cwd 为活动 `main` 的 `ResourceIO`，删除/Trash/native import 相关断言恢复成功；保留原默认 owner 则稳定 503。

## 6. 修复契约

- **必须改变：** 1) Knowledge `main`、工作台活动工作目录与 Engine/Server 公开 ResourceIO 必须由单一可观察 owner 绑定；切换 workspace 时旧 owner、registry、operation coordinator 与 watcher 一起失效并重建；2) 保存、创建、paste/cut、delete/restore 全部经该 owner 与既有 coordinator/journal；3) 创建 dialog 在提交后立即进入不可重入状态，成功/失败/取消都关闭或恢复可用状态，成功后只触发一次 refresh/open；4) Knowledge resource tree 复用 Desk 的 resource preview/open、file-kind icon、native reveal/default-app/path 能力，并提供 context menu；5) clipboard payload 明确 workspace/source scope，跨来源 cut fail closed，copy 保持普通副本；6) Web/remote/无 native grant 场景隐藏绝对路径和原生动作。
- **必须保持：** `main` 语义、来源隔离、KnowledgeResourceAddress/ResourceRef 双层协议、ResourceIO 唯一用户资源权威、三方冲突、plan/commit journal、来源级 `.trash`、NativeResourceGrant/bridge、fail-closed 安全与远程路径隐私。
- **正确测试 seam：** `<Path>tests/knowledge-workspace-route.test.ts</Path>`、新增同根 owner composition regression；`<Path>tests/resource-io-route.test.ts</Path>`；`<Path>desktop/src/react/__tests__/components/CreateResourceDialog.test.tsx</Path>`；新增 KnowledgeResourceTree context-menu/open/icon/clipboard tests；必要的 Playwright 用户流程放入 `<Path>tests/knowledge-workspace-e2e/specs/</Path>`。
- **回归测试：** 修复前默认活动工作目录 setup 的 save/create/delete/native import 变红；修复后同一 setup 全部返回成功且磁盘事实正确；重复点击 create 只产生一个请求且 dialog 已卸载；树右键菜单对 file/folder 提供正确受限动作；same-source cut/paste 移动一次，cross-source cut 拒绝并保留源，copy 创建副本；`.md/.pdf/.jpg/.html` 打开路径分别复用既有 preview/default-app 策略。
- **OUT：** 不新增第二套知识文件存储或 provider；不把授权目录伪装成挂载目录；不修改 agent 会话级授权模型；不把非 Markdown 文件伪装成页面；不引入跨来源移动或自动链接重写；不实现永久删除绕过 `.trash`。
- **风险与回滚：** ResourceIO owner 切换涉及共享核心和工作区生命周期，使用单一绑定 facade、旧实例在切换前 drain/recover，失败时保留旧磁盘事实并将 Knowledge 标记 unavailable；UI context menu 只调用现有 API/native grant，可按组件回退，不改变文件协议。
- **推荐下游：** G-grill-with-docs（关闭高影响 UI/跨来源/原生降级决策）→ S-spec → T-tickets → I-implement。

## 7. 清理

- **原始回路重跑：** 已运行；默认 owner mismatch 保持红灯，显式同根 ResourceIO 控制通过。
- **`[DEBUG-...]` 搜索：** 无临时插桩。
- **一次性脚本/原型：** 无。
- **未清理项 owner 与删除条件：** 无。
