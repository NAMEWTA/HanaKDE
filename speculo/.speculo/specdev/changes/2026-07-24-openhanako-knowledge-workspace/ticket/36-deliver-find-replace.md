# Ticket 36: 交付当前 Markdown 文档查找替换

- **被阻塞于：** [`20-deliver-groups-tabs-breadcrumbs.md`](./20-deliver-groups-tabs-breadcrumbs.md)、[`27-deliver-live-preview-modes.md`](./27-deliver-live-preview-modes.md)
- **状态：** 未开始

## 战略与背景

- **战略：** 实现当前 buffer 内查找、大小写/全词/正则冻结语义、替换、选区与零宽匹配处理。
- **需求追踪：** KW-US-095, KW-US-096, KW-US-097, KW-US-098, KW-US-099, KW-US-100, KW-US-101, KW-US-102, KW-US-103, KW-US-104, KW-US-105, KW-US-106, KW-US-107, KW-US-108, KW-US-109, KW-US-110, KW-US-111, KW-US-112, KW-RULE-MARKDOWN
- **当前现状：** 当前实现接缝位于 `desktop/src/react/utils/find-marks.ts`、`desktop/src/react/components/chat/ChatFindBar.tsx`；本 ticket 只扩展这些公开边界。
- **用户可验证结果：** 完成本 ticket 后，验收者能够通过公开 API、真实临时 workspace 或可交互 UI 验证本标题声明的单一能力。

## 范围边界

| IN | REUSE | OUT |
|---|---|---|
| 实现当前 buffer 内查找、大小写/全词/正则冻结语义、替换、选区与零宽匹配处理。 | `desktop/src/react/utils/find-marks.ts`<br>`desktop/src/react/components/chat/ChatFindBar.tsx` | 未列入本 ticket 的后续功能；修改生成 bundle；创建平行文件系统、编辑器内核或私有 route 捷径 |

## 交付物

- `desktop/src/react/components/knowledge-workspace/KnowledgeFindBar.tsx`
- `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx`

## 需阅读的真实文件

- `desktop/src/react/utils/find-marks.ts`
- `desktop/src/react/components/chat/ChatFindBar.tsx`

## 固定实施契约

- [`architecture.md`](../architecture.md)
- [`spec.md`](../spec.md)

## 实施顺序

1. 先以当前真实文件和公开契约建立失败测试，不访问 Engine 私有字段。
2. 实现本 ticket 的最小垂直切片，复用 ResourceIO、共享 IR、coordinator 或既有 UI 接缝。
3. 补齐取消、冲突、权限/不可用、外部变化和清理路径。
4. 运行精确自动化、相关回归、typecheck 与 boundary 检查并记录实际结果。

## 实现约束

1. 普通资源访问必须经现有 ResourceIO/provider；复合 mutation 必须经公开 coordinator 和 Operation Journal。
2. Renderer 不访问 Node 文件系统；远程 DTO、日志和 release evidence 不含绝对路径、正文或凭证。
3. 测试使用隔离临时 HANA_HOME、workspace、来源和端口，不依赖开发机固定路径或网络。
4. 实现不得引入未在 ADR/实施契约冻结的新存储引擎、IPC path surface、恢复状态或 E2E 框架。
5. 本 ticket 新增 UI 同时交付 zh-CN、zh-TW、en、ja、ko、键盘、ARIA、focus、亮暗主题和窄布局。

## 自动化证据

**Primary ownership：** KW-US-095, KW-US-096, KW-US-097, KW-US-098, KW-US-099, KW-US-100, KW-US-101, KW-US-102, KW-US-103, KW-US-104, KW-US-105, KW-US-106, KW-US-107, KW-US-108, KW-US-109, KW-US-110, KW-US-111, KW-US-112

**必须创建或更新：**

- `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx`

**对应端到端场景：** E2E-KW-012

## 验收标准

- [ ] 只作用当前 view/session；替换进入单一历史；无效正则不修改文档。
- [ ] 本 ticket 拥有的每个 `KW-US-*` 都由上列精确测试直接证明；不存在范围兜底或 Ticket 57 代实现。
- [ ] 本 ticket 拥有的每个 `KW-RULE-*` 都满足对应契约文档，并有正常、取消/冲突、权限/不可用和故障注入覆盖。
- [ ] 相关既有回归、`npm run typecheck` 和 `npm run lint:boundary` 通过；涉及 composition、Renderer、preload/main 时运行相应 build。
- [ ] ticket 交付记录只填写实际执行命令、平台和结果；普通执行结果不写入 `LOG.md`。
- [ ] 交付物没有未决的“可能”“按需”“A 或 B”、未选框架、未选 schema 或未定义恢复语义。
