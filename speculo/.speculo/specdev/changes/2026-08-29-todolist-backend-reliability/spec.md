---
schema_version: 3
artifact: spec
change: 2026-08-29-todolist-backend-reliability
status: ready
ready_for_tickets: true
sources:
  - USER-DECISION:恢复 Todo 后台并完善 Todo List 增删改查
  - CODE:plugins/todolist
  - CODE:server/index.ts
---

# Spec: Todo 后台可靠性与完整 CRUD

## 1. 问题与目标

Todo builtin 插件已经拥有完整业务层，但宿主启动顺序使任务后台在插件加载时不可用；页面请求无超时又会把失败表现为永久加载。目标是恢复既有实现的宿主合同，保证 Todo 与 Project 的增删改查、持久化、提醒、周期任务、Agent 和交换能力继续通过同一插件实现工作。

## 2. 解决方案与外部行为

在初始化插件前注册现有 TaskRegistry event-bus handlers。Todo 页面为 SDK 请求增加有界超时与卸载取消，并在失败时显示错误和重试。新增基于真实 Hono routes 与真实临时磁盘 Store 的 CRUD 回归，不用 mock application service 代替后台验证。

## 3. 用户故事

- **US-001：** 作为 Todo 用户，我希望后台在桌面端启动后立即可用，以便提醒和 Agent 任务不再静默失效。
- **US-002：** 作为任务管理用户，我希望 Todo 和 Project 增删改查持久化，以便重启后状态不丢失。
- **US-003：** 作为插件页面用户，我希望后台异常时能看到错误并重试，而不是永久加载。
- **US-004：** 作为 Hana 用户，我希望 Todo 的颜色、圆角、按钮、密度和交互与系统工作台一致，而不是呈现另一套视觉语言。
- **US-005：** 作为 AI 用户，我希望 Todo 的完整工具目录稳定可用，以便通过相同领域能力管理任务、项目、提醒、周期和 Agent 执行。

## 4. 验收合同

| ID | 前置条件 | 动作或事件 | 可观察结果 | 验证接缝 |
|---|---|---|---|---|
| AC-001 | Server 冷启动且 Todo 为 builtin | 执行 plugin onload | TaskRegistry handler 已存在，`runtime.taskBackend` 为 `ready` | ordering test + real status |
| AC-002 | 可写临时 Todo Store | 创建、查询、修改、完成、重开、移入回收站、恢复并重启 Store | Todo 状态与 revision 持久化正确 | real HTTP route test |
| AC-003 | 可写临时 Todo Store | 创建、重命名、移入回收站、恢复 Project | Project CRUD 正确 | real HTTP route test |
| AC-004 | SDK 请求永不返回 | 打开 Todo 页面并等待超时 | spinner 结束，显示错误和重试；卸载不遗留 timer/request | browser UI test |
| AC-005 | 真实 Desktop plugin surface | 操作 Todo | 新建、编辑、完成、重开、删除、恢复和永久删除均成功，无 401/403 | real host smoke |
| AC-006 | 既有 Todo 完整套件 | 执行插件 verify | reminder、Agent、recurrence、exchange、migration 和冲突测试全部通过 | plugin suite |
| AC-007 | Todo 页面加载宿主主题 CSS | 打开任意系统主题下的 Todo 页面 | 页面只消费宿主/插件公共 token；输入与按钮为 4px 圆角、面板最大 8px，且无私有紫色回退、超大圆角或负字距 | CSS contract + real screenshot |
| AC-008 | Todo builtin plugin 已加载 | 枚举并导入 AI tools | 16 个公开工具覆盖 Todo、Project、Reminder、Automation、Recurrence 和 Exchange，全部保留 schema、execute 与权限描述 | tool catalog contract |

## 5. 范围

### IN

- TaskRegistry 宿主注册顺序。
- Todo 页面请求失败出口与卸载清理。
- Todo/Project 真实 route + disk Store CRUD 回归。
- 既有 Todo 插件完整回归与真实桌面页面 CRUD。
- Todo 页面与宿主设计 token、控件尺寸、圆角、页面层级和响应式交互一致。
- 既有 AI Todo 工具目录及其权限合同回归。

### REUSE

- `<Path>plugins/todolist/src</Path>` 的 application、domain、Store v2 和 UI。
- 现有 TaskRegistry、event bus、routes、SDK surface session。

### OUT

- 不改变 Todo 持久化 schema 或迁移格式。
- 不删除用户 Todo 数据或用户插件目录。
- 不新增任务调度框架或第二套 Todo 实现。
- 不包含 commit、push、版本提升或 release。

## 6. 已锁定实现约束

- **DEC-001：** 宿主合同必须在 `engine.initPlugins` 前就绪。
- **DEC-002：** HTTP CRUD 测试必须使用真实 routes 和真实磁盘 Store。
- **DEC-003：** 超时通过 SDK fetch seam 实现，并在页面销毁时取消所有 pending 请求。
- **DEC-004：** 不以忽略 task backend 错误或伪造 ready 状态掩盖故障。
- **DEC-005：** Todo 不建立私有设计系统；样式直接继承宿主 token，并遵循 `@hana/plugin-components` 的 4px input / 8px card 合同。
- **DEC-006：** AI 操作继续复用 Todo application service，不从页面或宿主新增第二套 CRUD。

## 7. 数据、接口与兼容

- 公共 HTTP 接口和响应 envelope 不变。
- Store schema 保持 v2，无数据迁移。
- `mountTodoApp` 增加可选测试/宿主配置参数，现有两参数调用兼容。

## 8. 非功能要求

- **可靠性：** 所有初始化请求必须有确定的成功或失败出口。
- **持久化：** CRUD 在 Store dispose/reopen 后保持正确。
- **兼容性：** 不更改现有 HTTP envelope、Store v2 或两参数页面挂载调用。

## 9. 验证策略

| 接缝 | 层级 | 覆盖合同 | 命令/方式 |
|---|---|---|---|
| Server startup ordering | static/integration | AC-001 | focused Vitest + real `/status` |
| Todo/Project routes + Store | integration | AC-002/003 | `plugins/todolist/tests/http-crud.test.ts` |
| page timeout/dispose | browser unit | AC-004 | `plugins/todolist/tests/ui-host.test.ts` |
| real plugin surface | E2E smoke | AC-005 | current Desktop + authenticated surface session |
| complete plugin behavior | regression | AC-006 | `npm run verify` in plugin |
| visual design contract | static + screenshot | AC-007 | CSS contract test + authenticated Desktop screenshot |
| AI tool catalog | contract | AC-008 | exact names/capability-family import test |

## 10. 风险与恢复

主要风险是提前安装 TaskRegistry handler 影响其他插件启动，或 timeout 产生未处理 rejection。通过宿主 focused tests、完整 Todo verify、真实 status 和页面 CRUD 验证。回滚只需恢复两个局部改动；数据格式未变化。
