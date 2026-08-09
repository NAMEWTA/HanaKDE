# 知识工作区测试与验收策略

本文件冻结 `KW-RULE-TEST`。单元、契约、集成、Electron E2E、Web E2E、性能和平台证据使用同一需求 ownership，不再由 Ticket 57 临时决定测试技术栈。

## 0. Ticket 测试选择规则

- **默认使用 Vitest。** 每个 ticket 运行与自身改动直接相关的 Vitest 单元、组件、契约或集成测试。
- **Playwright 只验证用户流程。** 只有 ticket 直接交付需要在真实 Browser/Electron 中串联用户操作、界面反馈与跨层结果的流程时，才运行该 ticket 标注的 Playwright 场景及适用 project。
- 纯逻辑、契约、存储、索引、API、安全、fixture、文档和可由 Testing Library 稳定证明的组件级行为，不运行 Playwright；即使它们被某个发布级 E2E 场景间接覆盖，也以 Vitest 作为 ticket 完成证据。
- ticket 中的“发布级关联场景”以及 `requirements-traceability.md` 的 E2E 列只表示最终回归可追溯关系，不是该 ticket 的 Playwright 门禁。完整用户流程套件仍由 Ticket 57 汇总运行。

## 1. 固定技术栈

- Unit/contract/integration：现有 Vitest 4。
- UI component：Testing Library + Vitest。
- Browser/Open/Full Web E2E：`@playwright/test@1.62.0`，Chromium。
- Electron Full E2E：Playwright `_electron`，使用仓库 Electron 42。
- 原生对话框：通过 `electronApplication.evaluate()` 在主进程替换 `dialog`，不驱动真实 OS 对话框。

Ticket 01 增加 dev dependency 和 scripts：

```json
{
  "devDependencies": { "@playwright/test": "1.62.0" },
  "scripts": {
    "test:knowledge:e2e": "playwright test -c tests/knowledge-workspace-e2e/playwright.config.ts",
    "test:knowledge:e2e:desktop": "playwright test -c tests/knowledge-workspace-e2e/playwright.config.ts --project=desktop-full",
    "test:knowledge:e2e:open": "playwright test -c tests/knowledge-workspace-e2e/playwright.config.ts --project=web-open",
    "test:knowledge:e2e:full": "playwright test -c tests/knowledge-workspace-e2e/playwright.config.ts --project=web-full"
  }
}
```

## 2. 目录

```text
tests/knowledge-workspace-e2e/
├── playwright.config.ts
├── fixtures/
│   ├── app-fixture.ts
│   ├── server-fixture.ts
│   ├── workspace-fixture.ts
│   └── native-fixture.ts
├── specs/
│   ├── E2E-KW-001-shell.spec.ts
│   └── ...
└── artifacts/                 # gitignored
```

每个测试创建独立临时 `HANA_HOME`、main、mounted sources、端口和用户配置。禁止读取开发者真实 home、固定端口、网络或已有 workspace。

## 3. Projects

| Project | 启动 | 必须证明 |
|---|---|---|
| `desktop-full` | build preload/main/renderer/server 后由 `_electron.launch` 启动 `desktop/bootstrap.cjs` | Electron bridge、Full composition、多个隔离 Renderer context（不新增浮动窗口产品入口） |
| `web-open` | `build:server:open` + 独立临时 server | 无 Electron 状态；Open boundary；native unavailable |
| `web-full` | full server + browser renderer | Full 注入不改变共享 DTO |

LAN/Mobile contract 由 integration test 覆盖；至少 E2E-KW-021 在 `web-open` 使用非 loopback client 模式运行。

## 4. 固定 Playwright 用户流程场景

下表是发布级用户流程回归集。只有 ticket 明确标为“Playwright 用户流程：适用”时，才在该 ticket 内运行对应场景；标为“发布级关联场景”的 ticket 只运行 Vitest，由直接用户流程 ticket 或 Ticket 57 运行 Playwright。

| ID | 场景 | Projects |
|---|---|---|
| E2E-KW-001 | 空白 main 打开知识壳，不恢复旧 tabs/mount/tree | desktop-full, web-open |
| E2E-KW-002 | Open/Full 相同 DTO、错误码和 capability；Full 只注入 UI | all |
| E2E-KW-003 | 注册两个不重叠来源；拒绝 same/ancestor/unknown root | desktop-full, web-open |
| E2E-KW-004 | tabs、preview、分组、同页多视图共享 session | desktop-full |
| E2E-KW-005 | 手动保存、expected-version、无 autosave、撤销基线 | desktop-full, web-open |
| E2E-KW-006 | 安全文本/图片/PDF/媒体/unknown asset viewer | desktop-full, web-open |
| E2E-KW-007 | 外部磁盘变化触发 clean reload 与 dirty 三方冲突 | desktop-full, web-open |
| E2E-KW-008 | 最后视图、workspace switch、source loss、orphan 保存 | desktop-full |
| E2E-KW-009 | 同源 Wikilink、补全、延迟建页、embed、backlink | desktop-full, web-open |
| E2E-KW-010 | 跨来源页面/附件先复制后链接，复制失败不改正文 | desktop-full, web-open |
| E2E-KW-011 | Mermaid/math/footnote/HTML 安全渲染和错误隔离 | desktop-full, web-open |
| E2E-KW-012 | find/replace 焦点、循环、单步撤销、跨 tab 行为 | desktop-full |
| E2E-KW-013 | per-source index、search 分组、query/outbound/backlink | desktop-full, web-open |
| E2E-KW-014 | index corruption、schema mismatch、cancel rebuild、旧 generation 可用 | web-open |
| E2E-KW-015 | tree keyboard/range/context/sort/preview/reveal | desktop-full |
| E2E-KW-016 | create page/folder、冲突、失败无半成品 | desktop-full, web-open |
| E2E-KW-017 | native picker/default/reveal capability 与 Open 降级 | desktop-full, web-open |
| E2E-KW-018 | internal clipboard、system file clipboard、drag/drop | desktop-full |
| E2E-KW-019 | rename/move 链接重写；每个故障点重启后恢复 | desktop-full, web-open |
| E2E-KW-020 | trash delete/restore/conflict/retention/system trash failure | desktop-full |
| E2E-KW-021 | LAN/Mobile 不接收绝对路径，owner/scope fail-closed | web-open |
| E2E-KW-022 | malicious workspace：symlink/junction/URI/HTML/TOCTOU/limits | platform matrix |
| E2E-KW-023 | 五语言、主题、窄布局、键盘和 screen-reader smoke | desktop-full |
| E2E-KW-024 | 自动化创建两个 Renderer context，验证同时打开、保存、冲突与 native grant 隔离；不验收浮动窗口产品入口 | desktop-full |

## 5. Requirement Evidence

[`requirements-traceability.md`](./requirements-traceability.md) 是 ownership 权威表。每个 `KW-US-*`：

- 只有一个 `primaryOwnerTicket`，且不能是 Ticket 57。
- 至少一个精确自动化测试路径。
- 可以有 supporting tickets，但 supporting 不替代 owner 验收。
- Ticket 57 只确认所有 owner 已完成、测试实际运行并在 `release-evidence.md` 有证据。

## 6. Failure Injection

operation/index/native/provider 必须通过显式依赖注入或测试 hook 提供命名故障点。生产默认关闭；测试不得 monkey patch 私有内部字段作为唯一证据。

## 7. CI 与重试

- Unit/integration 不自动 retry。
- E2E CI 最多 retry 1 次；首次失败仍保留 trace/video/log，并在 release evidence 中标记 flaky，不能只记录重试成功。
- `trace: retain-on-failure`、`screenshot: only-on-failure`、`video: retain-on-failure`。
- 每个 worker 使用独立临时端口和目录；Desktop project 默认 workers=1，Web project 可 workers=2。
- 普通 ticket CI 默认只调度 Vitest；只有 ticket 明确标为 Playwright 适用或执行 Ticket 57 发布回归时，才安装浏览器并调度对应 project。

## 8. 平台矩阵

| 能力 | macOS | Windows | Linux |
|---|---|---|---|
| core/open server | required | required | required |
| local root identity | required | required incl. junction/UNC | required |
| system trash | required | required | required or explicit unavailable |
| native picker/reveal/default app | required | required | required |
| case behavior | default volume + recorded mode | insensitive | sensitive |

无法在某平台执行的项目必须在 release evidence 中写明原因和风险；不能把“未执行”标为通过。

## 9. 性能

性能算法 smoke 进入普通 CI；完整数据集只在指定 reference runner 执行。统计方法、seed、次数和阈值见 `performance-budget.md`。
