# OpenHanako v0.446.6 集成架构

> 本文记录实际实现，不是下一阶段计划。事实固定于本 change 的 integration
> branch，当前文档候选基线为 `de0eb983`；后续代码或平台 Gate 变化必须同时更新
> 本文和 upstream ledger。版本以 `package.json` 的 `0.446.6` 为准。

## 1. 系统边界与唯一 owner

| 领域 | 当前 owner | 事实接缝 |
|---|---|---|
| Engine/Workspace 生命周期 | Core workspace runtime | `core/workspace-runtime/`、`core/engine.ts` |
| 物理观察与事件 | production workspace runtime + ResourceEventBus | `core/workspace-runtime/production-workspace-runtime.ts`、`server/resource-events-ws.ts` |
| Resource authority | ResourceIO / local provider | `lib/resource-io/resource-io.ts`、`lib/resource-io/local-fs-provider.ts` |
| Main File History | T-13 service + T-16 UI | `lib/file-history/`、`desktop/src/react/components/file-history/` |
| Secure restore | T-15 production adapter/native helper | `core/workspace-runtime/production-workspace-runtime.ts`、`lib/resource-io/native-secure-write.ts`、`desktop/native/HanaSecureFsHelper/` |
| Knowledge index/repair | Knowledge workspace | `lib/knowledge-workspace/`、`core/knowledge-workspace/` |
| Shared extraction | DocumentExtractionService | `lib/document-extract/`、`lib/knowledge-workspace/document-index-extractor.ts` |
| Office adapter | Office plugin adapter | `plugins/office/` |
| Production packaging | T-21 | `scripts/build-server*.mjs`、`scripts/build-secure-fs-helper.mjs`、`export-manifest.json` |

每个物理 watcher、baseline、History store、Knowledge store、Extraction child
和 secure write primitive 只有一个 owner。T-17 只做 Agent file-change 的严格
投影，不新建 watcher、store、route 或 restore writer；当前 producer envelope
能力不足时，投影 fail closed。

## 2. 主资源观察流

```text
main root activation
  -> production workspace runtime (root identity + scope proof)
  -> one physical watcher / baseline
  -> ResourceEventBus (ordered, scoped, versioned)
  -> Knowledge index coordinator / History projection
  -> main-only UI reads (files, versions, diff, restore)
```

mounted/remote resources 保留 operation impact，但不能获得 Main History 权限。
所有公开地址是 source-relative `KnowledgeAddress`；absolute root、public
workspace id、Agent id 和 raw path 都不进入 renderer/server 合同。

### 生命周期与恢复

打开 root 时先取得 no-follow identity，再建立 observation；切换或关闭时先
停止旧 owner、等待资源释放，再启动新 owner。观察恢复从新 baseline 开始，使用
scoped gap/reconcile，不做全树 shadow watcher。root replacement、symlink escape、
identity mismatch、stale version 和 TOCTOU proof 不通过时 fail closed。

History restore 的唯一写入口是现有 `ResourceIO.writeExpectedVersion`。T-15
在 effect 时重新校验 provider root identity，并把 native proof 绑定到当前内容
和父链；条件失败返回 typed conflict，不覆盖用户新内容。

## 3. History、Agent 与 Knowledge

History SQLite 与 Knowledge index 是两个独立模型和生命周期。T-16 的按钮、diff、
restore modal 只接受 Main-bound opaque relative address。T-17 的 projector 要求
conversation/session、UUIDv4 operation 和 source-relative resource 三者与当前
scope generation 精确匹配；不匹配就只返回 operation impact 或 null。

Office、PDF 和其它文档先经过共享 `DocumentExtractionService`：

```text
Office adapter
  -> ResourceIO read/materialize lease
  -> bounded extraction child (AnyDoc/HTML)
  -> normalized extraction result / stable failure
  -> Knowledge IR + versioned index rebuild
```

Extraction 不做 OCR，不把中间文件写回用户 root，不启动第二个 parser owner，
并在失败或取消时清理 child/lease。

## 4. Production packaging

T-21 统一拥有 manifest、closure、server/client build 和 CI package inputs：

1. 先构建目标平台 secure helper，再构建 client/server。
2. SSR full/open bundle 显式包含 extraction child；`ssr.noExternal` 与审计后的
   external list 一致。
3. server runtime 用 nft closure prune，seed 同时包含 server、renderer、manifest
   和 signature；secure helper 在 seed signing 前按目标 arch staging。
4. Electron app 从 `Contents/Resources/seed/` 解包，不能依赖开发机 node_modules
   或未列入 export manifest 的源文件。

T-21 已在 macOS arm64 完成 clean install、full/open build、closure census、seed
verify 和 local DMG；Windows native runtime/NSIS 仍由 T-22 阻断，macOS x64 和
硬件 sleep/reconcile 仍由 T-23 review residual 覆盖。

## 5. 健康与故障恢复

健康状态由 observation/runtime 事实驱动，不能由 UI 自己推断。常规恢复顺序是：

1. 停止旧 watcher/child/server owner，确认 descriptor/process 归零。
2. 重新验证 root identity 和 scope generation。
3. 建立一次 scoped baseline，消费 gap/reconcile 结果。
4. 失败时保留 typed health/error 状态，允许用户重试；不启动 dual-run 或
   compatibility shell。

数据纪元 restore 仍使用 checkpoint/journal 的 stop-then-start 语义；本 change
不引入旧 Profile migration、legacy compatibility window 或自动 OCR。

## 6. 当前 Gate 状态

| Gate | 状态 | 事实 |
|---|---|---|
| T-21 / G8 | integrated/done | merge `e1b232b3`，Lead standards/specification pass |
| T-22 / W9-WIN | ready | 当前 macOS 主机没有真实 Windows runner，不能声称通过 |
| T-23 / W9-MAC | review | merge `477a1b6a`；arm64 harness/DMG pass，x64、硬件 sleep、interactive E2E 和 event-bus warning 尚未收口 |
| T-24 / W9-DOCS | in progress | 本文、ledger、troubleshooting 正在提交 |
| T-25 / G10 | ready/blocked by upstream gates | 只有 T-22/T-23/T-24 完成后才能做最终 verdict |

任何维护者看到 `review` 或 `ready` 都必须保留该限制，不能把 `covered` Map 行当作
平台通过。
