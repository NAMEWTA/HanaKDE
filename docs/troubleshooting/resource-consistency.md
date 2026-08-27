# Resource Consistency Troubleshooting

本文面向维护者和本地诊断，不提供用户数据迁移或兼容旧 Profile 的步骤。所有日志
必须脱敏；不要粘贴 token、absolute root、用户文件内容或临时 private key。

## Health reading order

1. 查看 main workspace health/runtime state，确认当前 scope generation 和 root
   identity 是否仍有效。
2. 查看 ResourceEventBus sequence、gap/reconcile reason 和 watcher diagnostics；
   physical watcher、baseline、descriptor 应各只有一个 owner。
3. 查看 Knowledge index operation/rebuild status，再查看 History versions/diff；
   不要直接读取 History SQLite 或 Knowledge SQLite 作为 UI 结论。
4. 若是 packaged app，查看 seed/launch diagnostics 和 server child exit classification；
   `Server 被信号终止` 只有在非预期退出时才是 crash，主动 stop-then-start 清理应单独分类。

## Safe recovery

### Observation gap or stale health

- 先停止旧 observation，再重新验证 root identity。
- 执行一次 scoped baseline/reconcile，确认 old sequence 不会 replay 到新 scope。
- 不要启动第二个 watcher、全树私有扫描或并行 baseline；若 owner overlap 非零，
  保持 blocked 并回 T-11/T-12。

### Restore conflict or unsafe request

- 保留用户当前 bytes，重新获取 files/versions/diff。
- 只通过 Main History 的 existing restore route 重试；`resource_version_conflict`
  或 root proof failure 是 fail-closed 结果，不是可通过强制覆盖解决的 UI 错误。
- Agent、mounted/remote 或 raw path 没有 restore authority；回到对应 owner。

### Extraction/Office failure

- 检查 format/size/parse failure classification、child exit 和 materialize lease cleanup。
- 确认失败不会在用户 root 留下临时文件，也不会启动第二个 parser/OCR pipeline。
- 用共享 `DocumentExtractionService` 的 bounded retry；不要把任意 child stderr
  直接显示给用户或写入长期文档。

## Packaged app diagnostics

- T-21 packaged server 位于 `Contents/Resources/seed/` 的 server tar，不要假设开发
  机上存在展开的 `Resources/server`。
- 先验证 seed manifest/signature、server archive、renderer archive、AnyDoc child、
  HTML child 和目标架构 secure helper，再判断 Electron UI。
- macOS 发布门必须直接消费刚生成的 DMG，递归清除 quarantine 后启动；禁止在测试中
  对 app bundle 重签。启动前后包内 SHA-256 不一致、dyld Team ID 错误或缺少
  `main-loaded` marker 都必须阻断上传。
- macOS arm64/x64 与 Windows `NotSigned` 安装/启动门均在 artifact upload 前运行；
  任一平台环境缺失时不能用静态 inventory 或本地重签代替。

## Escalation rules

| Signal | Action |
|---|---|
| root identity/reparse/symlink mismatch | fail closed; preserve bytes; reopen T-15/T-22/T-23 native fixture |
| watcher overlap or descriptor leak | stop new owner; reopen T-11/T-12; do not waive |
| stale version/TOCTOU conflict | return typed conflict; never force write |
| extraction child/lease leak | stop operation; inspect T-19/T-20 cleanup and package assets |
| Windows/macOS package missing native input | block T-22/T-23/T-25; do not substitute Linux |
| missing or stale Evidence SHA | mark documentation/final Gate review, not done |
