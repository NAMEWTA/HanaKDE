---
schema_version: 3
artifact: ticket
change: 2026-08-30-entity-dossier-plugin
id: T-09
title: 交付档案目录与搜索 UI 组件
status: done
planning_depth: standard
planning_depth_reason: 组件需覆盖创建、筛选、详情和空错状态，但不拥有插件入口或权威数据写入。
ready: true
risk: medium
blocked_by: [T-02, T-07]
contract_ids: [AC-006, AC-008, AC-015, AC-016]
owner: root
expected_changes: ["<Path>plugins/dossiers/src/ui/catalog/**</Path>", "<Path>plugins/dossiers/tests/ui/catalog/**</Path>"]
writable_paths: ["<Path>plugins/dossiers/src/ui/catalog/**</Path>", "<Path>plugins/dossiers/tests/ui/catalog/**</Path>"]
read_only_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/application/catalog/**</Path>", "<Path>plugins/dossiers/src/application/index/**</Path>", "<Path>plugins/dossiers/src/interfaces/routes/catalog/**</Path>", "<Path>plugins/dossiers/src/interfaces/routes/index/**</Path>"]
shared_paths: ["<Path>plugins/dossiers/src/domain/**</Path>", "<Path>plugins/dossiers/src/runtime.ts</Path>"]
shared_path_owners: ["<Path>plugins/dossiers/src/domain/**</Path> => T-01", "<Path>plugins/dossiers/src/runtime.ts</Path> => T-01"]
---

# Ticket T-09: 交付档案目录与搜索 UI 组件

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/ticket/09-catalog-ui-components.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-09.md</Path>`

## 1. 战略与来源

- **目标：** 提供适合单机知识工作台的档案创建、目录浏览、元数据搜索和详情编辑组件。
- **可观察产出：** 用户能创建个人/公司/项目/自定义档案，筛选目录，编辑属性并看到联系人摘要和明确空错状态。
- **来源：** US-002、US-004；AC-006、AC-008、AC-015、AC-016；ADR-003。
- **当前事实：** 数据和 route 契约由 T-02/T-07 提供；本 Ticket 不拥有 Page 装配和主机通信入口。
- **Planning Depth 原因：** 标准组件切片，风险集中在状态覆盖、可访问性和契约一致性。

## 2. 决策状态

### 已锁定决策

- 工作型密度布局，首屏直接是可用目录，不做营销页或说明卡。
- 档案类型通过模板/选择器呈现；属性编辑根据字段类型选择合适控件。
- 搜索只表现元数据结果，不宣称全文/OCR。
- UI 仅调用注入的 typed client，不直接访问 host、文件系统或 SQLite。

### 已采用的低影响假设

- 桌面采用目录/详情双栏，窄屏切为目录与详情两个可返回视图。

### 未决问题

无。

## 3. 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 目录、搜索筛选、创建编辑表单、联系人摘要、状态组件 | T-02/T-07 DTO/routes、现有 UI tokens/icons | Page shell、资料操作、Agent、文件选择、产品导航 |

## 4. 要构建什么

实现可被 T-11 Page 注入 client 的 catalog feature。用户从目录搜索或筛选档案，打开详情后编辑名称、类型、标签和自定义属性，也能从模板创建新档案。组件覆盖 loading、empty、validation、conflict、index stale 和 retry，窄屏交互不丢失上下文。

## 5. 实现契约

- **入口或接缝：** `CatalogFeature` 组件及 typed client/callback props。
- **输入与输出：** catalog/search DTO、draft form、expected version；输出 create/update/select/rebuild intents。
- **公共接口变化：** 新增 UI component exports，不新增 host route。
- **不变量：** UI 不持久化权威事实；冲突不覆盖；搜索文案准确限定元数据。
- **状态或数据流：** query -> list -> select -> edit draft -> submit -> refreshed detail。
- **错误与失败行为：** 字段错误就地显示；409/stale 保留 draft 并允许刷新比较；离线/索引错误可重试。
- **兼容要求：** 未知自定义字段以安全只读形式展示，不崩溃。
- **安全与隐私要求：** 不渲染未信任 HTML；路径和敏感原值不进入错误文案。

## 6. 执行路线

1. 建立 typed client fixture 和目录/详情状态模型。
2. 实现模板创建、筛选搜索和响应式目录导航。
3. 实现属性编辑、联系人摘要及 validation/conflict 状态。
4. 运行组件交互、键盘可访问性和窄屏布局验证。

## 7. 路径访问契约

- **预计修改点：** catalog UI 与对应 tests。
- **可写范围：** `plugins/dossiers/src/ui/catalog/**` 和 tests；越界前停止。
- **只读上下文：** T-01/T-02/T-07 contracts。
- **共享路径：** domain/runtime 只读，唯一 owner T-01。
- **保留或不动：** Page shell、operations UI、manifest、产品 UI。

## 8. 验证矩阵

| 行为或风险 | 接缝 | 步骤 | 预期 | Evidence |
|---|---|---|---|---|
| 创建/搜索/编辑 | component harness | 模板创建、组合筛选、保存属性 | intent/刷新正确，目录稳定 | `<Path>{roots.state}/specdev/changes/2026-08-30-entity-dossier-plugin/evidence/T-09.md</Path>` |
| 错误与冲突 | client fixture | validation、409、index stale | draft 保留且有可执行恢复 | 同上 |
| 响应式回归 | browser component test | 桌面和窄屏操作 | 无重叠/截断，键盘路径可达 | 同上 |

- **Workspace checks：** UI component tests、type/lint、可访问性和 viewport screenshots。
- **E2E disposition：** not-required：本 Ticket 仅交付注入 client 的组件，不跨真实 host 边界；主机 Page 中的完整目录流程由 T-11 承接。
- **E2E owner/environment：** Lead / current-workspace；T-11 在真实 Hana 主机执行集成 E2E。
- **Integration evidence：** implementation/source commit、parent before、candidate/result SHA。

## 9. 发布、迁移与恢复

- **迁移顺序：** 不适用：无持久化格式。
- **兼容窗口：** client DTO 由 route schema/type tests 锁定。
- **监控信号：** 不适用：组件不直接写审计或遥测。
- **回滚或前向恢复：** 回退组件 commit，不影响权威数据。
- **不可逆操作与批准点：** 无；删除动作不在本 Ticket。
- **收缩条件：** 不适用：新增组件。

## 10. 验收标准

- [x] AC-006、AC-008、AC-015、AC-016 的组件行为证据通过。
- [x] 正常、失败、窄屏和键盘回归均记录到 Evidence。
- [x] 实际项目修改未超出 writable paths。
- [x] 集成 E2E 由 T-11 承接且接口已锁定。
