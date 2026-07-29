# 知识工作区发布证据

本文件是实施与发布证据的当前状态表，不是设计日志。初始状态均为“未执行”；Ticket 57 只能填入实际命令、artifact 和结果。

## 运行环境

| 项 | 值 |
|---|---|
| Commit | `d3f3b22d`（Ticket 25 实现验证点） |
| Branch | `hanakde` |
| Node/npm | Node `v24.16.0` / npm `11.13.0`（Volta） |
| OS/CPU/RAM/File system | macOS Darwin 25.5.0 / Apple M5 arm64 / 16 GiB / APFS |
| HANA_HOME | Vitest/Smoke `mkdtemp` 隔离目录（执行后清理，不记录本机绝对路径） |

## Milestone evidence

| Milestone | Gate | Status | Artifact/command |
|---|---|---|---|
| M0 基础契约（Tickets 01–14） | P0 | 通过 | Node 24、SQLite ABI/FTS5、Playwright 1.62.0 基础设施、Open/Full boundary、来源 root identity、ResourceIO transfer、operation journal、共享 IR/CM6、性能夹具及 TM 测试入口均已有实际证据；Ticket 14 全仓验证 1016 files passed、1 skipped，10211 tests passed、6 skipped；typecheck、boundary、Renderer build 通过 |
| M1 Workspace/文档（Tickets 15–22） | P1 | 通过 | Knowledge 壳、多来源树、Asset Viewer、共享 session/view、expected-version 手动保存、递归 groups/tabs、三方冲突，以及统一 close/switch/quit 与 orphan 保存均已交付。Ticket 22 精确 25/25、相关 61/61；当前产品范围全仓 1030 files passed、1 skipped，10334 tests passed、6 skipped；typecheck、boundary 与 Renderer build 通过。E2E-KW-004–008/024 按真实入口依赖保留待回填 |
| M2 Markdown（Tickets 23–39） | P1/P2 | 部分通过（Tickets 23–30） | canonical address/LinkResolver、CM6 同源链接、Frontmatter 保真投影、来源隔离标签、页面内 GFM task、Live Preview/Source、Enter/Tab 行级事务、四格式快捷键与固定斜杠菜单已交付。Ticket 30 精确 23/23、相关 129/129；当前产品范围全仓 1039 files passed、1 skipped，10481 tests passed、6 skipped；typecheck、boundary 与 Renderer build 通过 |
| M3 索引/查询（Tickets 40–46） | P1 | 未执行 | — |
| M4 资源操作（Tickets 47–56） | P1 | 未执行 | — |
| M5 发布（Ticket 57） | P2 | 未执行 | — |

## Requirement evidence

| Requirement | Owner | Automated evidence | E2E | Status | Artifact/command |
|---|---:|---|---|---|---|
| KW-US-001 | 05 | `tests/knowledge-source-registry.test.ts`<br>`tests/provider-root-identity.test.ts` | E2E-KW-003 | 通过 | `npm exec -- vitest run tests/knowledge-source-registry.test.ts tests/provider-root-identity.test.ts`；cwd/活动 workspaceMountId 均映射为不可卸载 main，附加来源为会话态 |
| KW-US-002 | 05 | `tests/knowledge-source-registry.test.ts`<br>`tests/provider-root-identity.test.ts` | E2E-KW-003 | 通过 | `npm exec -- vitest run tests/knowledge-source-registry.test.ts tests/provider-root-identity.test.ts`；Provider root identity/broker 对 same/ancestor/descendant/unknown 全部拒绝，只允许可证明 disjoint |
| KW-US-003 | 23 | `tests/knowledge-link-resolver.test.ts` | E2E-KW-009 | 通过 | `npx vitest run tests/knowledge-link-resolver.test.ts`（22/22）；Wikilink 持久化为当前 Source 根相对 canonical path，保留真实 Unicode、大小写与扩展名，不写 sourceKey |
| KW-US-004 | 03 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 | 通过 | `volta run npx vitest run tests/knowledge-contract-schema.test.ts tests/knowledge-open-full-composition.test.ts tests/resource-io-route.test.ts`（135/135，macOS arm64，契约/集成） |
| KW-US-005 | 38 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 | 未执行 | — |
| KW-US-006 | 38 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 | 未执行 | — |
| KW-US-007 | 05 | `tests/knowledge-source-registry.test.ts`<br>`tests/provider-root-identity.test.ts` | E2E-KW-003 | 通过 | `npm exec -- vitest run tests/knowledge-source-registry.test.ts tests/provider-root-identity.test.ts`；realpath/dev/ino/scope token；symlink retarget 重验、alias/nested root、跨 namespace unknown 均被拒绝 |
| KW-US-008 | 05 | `tests/knowledge-source-registry.test.ts`<br>`tests/provider-root-identity.test.ts` | E2E-KW-003 | 通过 | `npm exec -- vitest run tests/knowledge-source-registry.test.ts tests/provider-root-identity.test.ts`；相同历史 opaqueRootId 可显式复用空闲 key；不同根、活动冲突、workspace 切回自动恢复均拒绝/不发生 |
| KW-US-009 | 03 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 | 通过 | `volta run npx vitest run tests/knowledge-contract-schema.test.ts tests/knowledge-open-full-composition.test.ts tests/resource-io-route.test.ts`（135/135，macOS arm64，契约/集成）；远程 DTO/错误无本地绝对路径 |
| KW-US-010 | 09 | `tests/mobile-workbench-route.test.ts`<br>`desktop/src/react/__tests__/mobile/knowledge-access.test.ts` | E2E-KW-021 | 通过 | `npx vitest run tests/http-route-security.test.ts tests/resource-io-route.test.ts tests/resource-watch-registry.test.ts tests/knowledge-workspace-route.test.ts tests/resource-events-ws.test.ts tests/ws-scope.test.ts tests/mobile-workbench-route.test.ts tests/chat-route-switching.test.ts desktop/src/react/__tests__/services/knowledge-workspace-client.test.ts desktop/src/react/__tests__/services/resource-events.test.ts desktop/src/react/__tests__/mobile/knowledge-access.test.ts desktop/src/react/__tests__/mobile/MobileApp.test.tsx`（12 files、274/274）；两来源同相对路径隔离、跨来源 transfer 保留 sourceKey、Mobile 独立水合/取消、LAN 权限链、无路径 DTO 与租约清理通过 |
| KW-US-011 | 15 | `desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx`<br>`tests/knowledge-i18n-a11y-contract.test.ts` | E2E-KW-001, E2E-KW-023 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx tests/knowledge-i18n-a11y-contract.test.ts`（2 files、6/6）；Knowledge 固定同级顶层入口、main 首位与单一空编辑组通过 |
| KW-US-012 | 16 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx`（1 file、6/6）；main/挂载来源根、精确 KnowledgeResourceAddress 懒加载、嵌套目录、来源 watcher、事件增量刷新和单来源故障隔离通过 |
| KW-US-013 | 16 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx`（1 file、6/6）；`notes.md`、`nested.page.md`、`archive.tar.gz` 与未知后缀 `raw.sdfds` 均以完整原始名称显示 |
| KW-US-014 | 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-015 | 48 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.keyboard.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-016 | 48 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.keyboard.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-017 | 48 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.keyboard.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-018 | 48 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.keyboard.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-019 | 47 | `desktop/src/react/__tests__/components/resource-tree-selection.test.ts` | E2E-KW-015 | 未执行 | — |
| KW-US-020 | 47 | `desktop/src/react/__tests__/components/resource-tree-selection.test.ts` | E2E-KW-015 | 未执行 | — |
| KW-US-021 | 47 | `desktop/src/react/__tests__/components/resource-tree-selection.test.ts` | E2E-KW-015 | 未执行 | — |
| KW-US-022 | 47 | `desktop/src/react/__tests__/components/resource-tree-selection.test.ts` | E2E-KW-015 | 未执行 | — |
| KW-US-023 | 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-024 | 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-025 | 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-026 | 54 | `tests/knowledge-refactor-rollback.test.ts`<br>`tests/knowledge-refactor-crash-recovery.test.ts` | E2E-KW-019 | 未执行 | — |
| KW-US-027 | 54 | `tests/knowledge-refactor-rollback.test.ts`<br>`tests/knowledge-refactor-crash-recovery.test.ts` | E2E-KW-019 | 未执行 | — |
| KW-US-028 | 47 | `desktop/src/react/__tests__/components/resource-tree-selection.test.ts` | E2E-KW-015 | 未执行 | — |
| KW-US-029 | 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-030 | 16 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx`（1 file、6/6）；同 workspace 重挂载恢复展开分支，折叠取消在途读取，新 workspace 清空展开状态 |
| KW-US-031 | 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-032 | 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-033 | 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-034 | 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-035 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx`（8/8）；单组可保留多个可切换资源 tabs |
| KW-US-036 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 通过 | 精确命令 `npx vitest run desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx`（8/8）；每组唯一 preview 被下一预览原位替换 |
| KW-US-037 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 通过 | 精确命令 `npx vitest run desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx`（8/8）；编辑、双击和拖动均把 preview 原地 pin |
| KW-US-038 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 通过 | 精确命令 `npx vitest run desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx`（8/8）；普通打开跨整棵布局激活既有 view |
| KW-US-039 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 通过 | 精确命令 `npx vitest run desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx`（8/8）；显式侧边打开建立第二 view 且同址 Markdown 共享 session |
| KW-US-040 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 通过 | 精确命令 `npx vitest run desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx`（8/8）；horizontal/vertical split 可递归组合 |
| KW-US-041 | 18 | `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts` | E2E-KW-004, E2E-KW-024 | 通过 | `npx vitest run desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts`（1 file、10/10）；同址双 view 即时共享 buffer/baseline/version/dirty 与跨 view undo/redo history |
| KW-US-042 | 18 | `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts` | E2E-KW-004, E2E-KW-024 | 通过 | `npx vitest run desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts`（10/10）；cursor、selection、scroll、viewport、mode、Live Preview 语法显隐按 view 独立，共享 edit 只映射位置 |
| KW-US-043 | 18 | `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts` | E2E-KW-004, E2E-KW-024 | 通过 | `npx vitest run desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts`（10/10）；会话内返回既有 view 恢复其 group、位置、滚动与 mode |
| KW-US-044 | 18 | `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts` | E2E-KW-004, E2E-KW-024 | 通过 | `npx vitest run desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts`（10/10）；关闭 view 后不缓存，重开从文档开头、零滚动和默认 Live Preview 开始 |
| KW-US-045 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 通过 | 精确命令 `npx vitest run tests/knowledge-workspace-lifecycle.test.ts desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx`（25/25）；非最后 view 直接关闭，不触发未保存询问 |
| KW-US-046 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 通过 | `npx vitest run tests/knowledge-workspace-lifecycle.test.ts desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx`（25/25）；最后 dirty view 提供保存、放弃与取消，取消不关闭 |
| KW-US-047 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 通过 | `npx vitest run tests/knowledge-workspace-lifecycle.test.ts desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx`（25/25）及 Workspace 相关回归；新 workspace 始终建立单个空编辑组 |
| KW-US-048 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 通过 | `npx vitest run tests/knowledge-workspace-lifecycle.test.ts desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx`（25/25）及 Workspace 相关回归；preview、pinned tab 与布局不跨 workspace 恢复 |
| KW-US-049 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 通过 | 精确命令 `npx vitest run desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx`（8/8）；移除最后 view 自动收拢空侧组且 dirty session 保留 |
| KW-US-050 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 通过 | `npx vitest run tests/knowledge-workspace-lifecycle.test.ts desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx`（25/25）；外部移除的 clean 文档保留原地址并显示失效，不重建或猜测新位置 |
| KW-US-051 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 通过 | `npx vitest run tests/knowledge-workspace-lifecycle.test.ts desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx`（25/25）；来源不可用时 clean 保留占位，dirty 转为携带当前 buffer 的 orphan |
| KW-US-052 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 通过 | `npx vitest run tests/knowledge-workspace-lifecycle.test.ts desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx`（25/25）；来源恢复仅重载 clean 文档，orphan 不自动重绑 |
| KW-US-053 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 通过 | 精确命令 `npx vitest run desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx`（8/8）；`A.md` 与 `archive.tar.gz` 均显示完整原始文件名 |
| KW-US-054 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 通过 | 精确命令 `npx vitest run desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx`（8/8）；来源/目录/完整文件名面包屑不含绝对路径，只有显式段点击发出定位 |
| KW-US-055 | 27 | `desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts` | E2E-KW-005 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts`（4/4）；inline 元素按 selection/caret 局部 reveal，heading/list/task/quote 按活动行 reveal，fenced code/Mermaid/block math 按活动块 reveal；源码模式统一卸载 Live Preview 装饰 |
| KW-US-056 | 27 | `desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts` | E2E-KW-005 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx`（15/15）；同一 EditorView/buffer/history 原子切换、不保存，mode/scroll 按 viewId 独立保持，dispatch 故障不提交 mode 并恢复 scroll；E2E-KW-005 spec 当前不存在，保留发布回填 |
| KW-US-057 | 12 | `desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx`（8/8）；覆盖 strict UTF-8、10 MiB 精确边界/超限拒绝、非法 UTF-8、BOM 去除、拒绝时不创建编辑缓冲、autosave/manual save 与目标切换隔离 |
| KW-US-058 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx`（1 file、10/10）；纯 LF/CRLF 原样保持，mixed 按多数且平局选 LF，首次保存提示规范化，UTF-8 BOM 保持 |
| KW-US-059 | 28 | `desktop/src/react/__tests__/editor/knowledge-enter-commands.test.ts` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-enter-commands.test.ts`（32/32）；无序/任务/引用同层延续、task 重置 `[ ]`、嵌套与组合空项只退出一层、围栏代码拒绝、只读/selection/dispatch 故障和单步 undo 均直接覆盖 |
| KW-US-060 | 28 | `desktop/src/react/__tests__/editor/knowledge-enter-commands.test.ts` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-enter-commands.test.ts`（32/32）；Enter 只插入当前编号加一并保留 `.`/`)` 与 marker spacing，已有前后连续/非连续编号不进入 change set |
| KW-US-061 | 29 | `desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts`（18/18）；空 caret 在普通 Markdown 与 fenced code 中恰好插入两个 ASCII spaces，多 caret 保持一个 transaction/undo step |
| KW-US-062 | 29 | `desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts`（18/18）；显式单行/多行/反向选区按实际触及的完整行缩进，边界位于下一行行首时不误含下一行，selection 映射稳定 |
| KW-US-063 | 29 | `desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts`（18/18）；Shift+Tab 每行最多删除两个行首 ASCII spaces，不产生负层级或删除 tab；readonly/非 Markdown 保留焦点语义 |
| KW-US-064 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx`（23/23）；Mod-B/I/K/反引号仅处理显式 selection/caret，readonly、IME、多 cursor 与非 Knowledge Markdown 不误触 |
| KW-US-065 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx`（23/23）；固定 17 项注册表复用格式 id/结构常量并提供统一斜杠模板执行 |
| KW-US-066 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx`（23/23）；普通正文、fenced code、正文中间与 selection 替换均在实际键入 `/` 时触发 |
| KW-US-067 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx`（23/23）；查询紧随 `/` 开始并在首个 Unicode whitespace 结束，正文全部原样保留且不自动执行 |
| KW-US-068 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx`（23/23）；名称/固定别名 Unicode case-insensitive 子串匹配、前缀优先与同类固定顺序通过 |
| KW-US-069 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx`（23/23）；单层 listbox 的固定图标、五语言名称/说明、平台快捷键、ARIA、当前项、内部滚动和键鼠交互通过 |
| KW-US-070 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx`（23/23）；block 命令只在触发点非行首时建立一个新逻辑行，行首不制造空行 |
| KW-US-071 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx`（23/23）；Markdown Link 固定插入 `[]()`、cursor 位于显示文字处，不读 selection/剪贴板且无 Tab 占位 |
| KW-US-072 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx`（23/23）；17 项逐一验证最小固定模板、唯一初始 cursor、一个 transaction 与单步 undo |
| KW-US-073 | 31 | `desktop/src/react/__tests__/editor/knowledge-table-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts` | 契约/集成 | 通过 | `npm test -- --exclude 'temp/**' desktop/src/react/__tests__/editor/knowledge-table-field.test.ts desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts`（25/25）；inactive 整块静态表格、任意行 selection/caret 整块源码、Source 模式与非法表格保留文本通过 |
| KW-US-074 | 31 | `desktop/src/react/__tests__/editor/knowledge-table-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts` | 契约/集成 | 通过 | 同一精确命令（25/25）；`:---`、`:---:`、`---:`、`---` 只派生 left/center/right/default，源码不重排且无 contentEditable cell |
| KW-US-075 | 31 | `desktop/src/react/__tests__/editor/knowledge-table-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts` | 契约/集成 | 通过 | `desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts`（精确命令合计 25/25）；已知语言 nested parser 高亮、未知/无语言纯文本、JavaScript/Lua/query/template 零执行与 Mermaid 分流通过 |
| KW-US-076 | 31 | `desktop/src/react/__tests__/editor/knowledge-table-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts` | 契约/集成 | 通过 | `desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts`（精确命令合计 25/25）；普通 code 使用响应式 visual soft wrap，resize 不改变文档行、正文或 undo history，字段零自建 observer |
| KW-US-077 | 32 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 | 通过 | `npm test -- --exclude 'temp/**' desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx`（8/8）；同一 Markdown Surface 使用 CM6 visual line wrapping，文档/selection/history 不派生折行状态 |
| KW-US-078 | 32 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 | 通过 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx`（8/8）；`↑/↓`、`Home/End` 与 Shift 组合只落在真实逻辑行 UTF-16 源码位置，短行 clamp，Live Preview/Source 无视觉导航状态机 |
| KW-US-079 | 32 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 | 通过 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx`（8/8）；Markdown Source/Live Preview gutter compartment 为空且 DOM 无 `.cm-gutters` |
| KW-US-080 | 32 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 | 通过 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx`（8/8）；活动 selection head 的 1-based UTF-16 行列、未保存 buffer 与 Unicode code point 总数实时投影，反向选区和 surrogate pair 通过 |
| KW-US-081 | 32 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 | 通过 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx`（8/8）；分屏活动组切换驱动唯一全局状态，资源树/侧栏取得焦点后保留最后活动 Markdown |
| KW-US-082 | 32 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 | 通过 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx`（8/8）；资产、缺失 session/view 与 missing/source-unavailable 隐藏整组文本并保留固定 `1.75rem` 空底栏 |
| KW-US-083 | 32 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 | 通过 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx`（8/8）；22rem container query 整组隐藏且不 truncate/wrap/ellipsis/scroll，宽度恢复后继续显示最新投影 |
| KW-US-084 | 33 | `desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-math-field.test.ts` | E2E-KW-011 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts desktop/src/react/__tests__/editor/knowledge-math-field.test.ts --exclude 'temp/**'`（2 files、13/13）；标准 Mermaid fence、长 opening fence、完整源码保真与 Source literal 直接通过 |
| KW-US-085 | 33 | `desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-math-field.test.ts` | E2E-KW-011 | 通过 | `knowledge-mermaid-field.test.ts`（6/6）；任一 selection range 触碰即回源、离开才渲染、exact-source cache、AbortSignal delivery cancellation、stale guard、单块错误与键盘回源通过；E2E 待 Tickets 48/49 真实打开入口回填 |
| KW-US-086 | 33 | `desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-math-field.test.ts` | E2E-KW-011 | 通过 | `knowledge-math-field.test.ts`（7/7）；行内 `$...$`、block `$$...$$`、escaped dollar、inline/fenced code 排除和源码保真通过 |
| KW-US-087 | 33 | `desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-math-field.test.ts` | E2E-KW-011 | 通过 | `knowledge-math-field.test.ts`（7/7）；多选区触碰回源、编辑期间零 KaTeX 调用、离开后单次刷新、inline/block 错误隔离、`strict:error`/`trust:false` 与 pointer/keyboard 回源通过；E2E 待 Tickets 48/49 回填 |
| KW-US-088 | 34 | `desktop/src/react/__tests__/editor/knowledge-footnote-field.test.ts` | E2E-KW-011 | 通过 | `knowledge-footnote-field.test.ts`（7/7）与共享 IR 回归（20/20）；reference/inline 紧凑标记、多行四空格/Tab 定义、selection 触碰回源、静态净化 Markdown hover、pointer/keyboard 同文档跳转与 Source literal 通过；E2E 待 Tickets 48/49 真实打开入口回填 |
| KW-US-089 | 34 | `desktop/src/react/__tests__/editor/knowledge-footnote-field.test.ts` | E2E-KW-011 | 通过 | `knowledge-footnote-field.test.ts`（7/7）；首个 exact label definition 生效、后续 duplicate 显式诊断、missing 非阻断 marker、`Note`/`note` 独立及删除首定义后重算通过；全部源码保持不变 |
| KW-US-090 | 34 | `desktop/src/react/__tests__/editor/knowledge-footnote-field.test.ts` | E2E-KW-011 | 通过 | `knowledge-footnote-field.test.ts`（7/7）；当前 buffer 首定义按位置和大小写 prefix 补全、duplicate 去重、完整 `[^label]` 单 transaction 插入/一步撤销、read-only/code unavailable 与 Source 模式真实 completion extension 通过 |
| KW-US-091 | 35 | `tests/knowledge-safe-links.test.ts`<br>`desktop/src/react/__tests__/utils/knowledge-safe-rendering.test.ts` | E2E-KW-011 | 未执行 | — |
| KW-US-092 | 35 | `tests/knowledge-safe-links.test.ts`<br>`desktop/src/react/__tests__/utils/knowledge-safe-rendering.test.ts` | E2E-KW-011 | 未执行 | — |
| KW-US-093 | 35 | `tests/knowledge-safe-links.test.ts`<br>`desktop/src/react/__tests__/utils/knowledge-safe-rendering.test.ts` | E2E-KW-011 | 未执行 | — |
| KW-US-094 | 35 | `tests/knowledge-safe-links.test.ts`<br>`desktop/src/react/__tests__/utils/knowledge-safe-rendering.test.ts` | E2E-KW-011 | 未执行 | — |
| KW-US-095 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-096 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-097 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-098 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-099 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-100 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-101 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-102 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-103 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-104 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-105 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-106 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-107 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-108 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-109 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-110 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-111 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-112 | 36 | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 | 未执行 | — |
| KW-US-113 | 37 | `desktop/src/react/__tests__/editor/knowledge-link-completion.test.ts`<br>`desktop/src/react/__tests__/commands/knowledge-link-navigation.test.ts` | E2E-KW-009 | 未执行 | — |
| KW-US-114 | 24 | `desktop/src/react/__tests__/editor/knowledge-link-field.test.ts` | E2E-KW-009 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-link-field.test.ts`（7/7）；同源 Page/Asset 插入保留真实扩展名并只写 Source 根相对 Wikilink，跨来源拒绝；共享 IR 驱动 CM6 同源渲染、断裂状态与安全激活 |
| KW-US-115 | 38 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 | 未执行 | — |
| KW-US-116 | 38 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 | 未执行 | — |
| KW-US-117 | 38 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 | 未执行 | — |
| KW-US-118 | 38 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 | 未执行 | — |
| KW-US-119 | 23 | `tests/knowledge-link-resolver.test.ts` | E2E-KW-009 | 通过 | `npx vitest run tests/knowledge-link-resolver.test.ts`（22/22）；Wikilink、Markdown destination 与重构格式化均绑定引用页面 sourceKey，跨来源、越界及不安全编码闭合拒绝且不搜索回退 |
| KW-US-120 | 39 | `desktop/src/react/__tests__/editor/knowledge-embed-field.test.ts` | E2E-KW-009 | 未执行 | — |
| KW-US-121 | 37 | `desktop/src/react/__tests__/editor/knowledge-link-completion.test.ts`<br>`desktop/src/react/__tests__/commands/knowledge-link-navigation.test.ts` | E2E-KW-009 | 未执行 | — |
| KW-US-122 | 35 | `tests/knowledge-safe-links.test.ts`<br>`desktop/src/react/__tests__/utils/knowledge-safe-rendering.test.ts` | E2E-KW-011 | 未执行 | — |
| KW-US-123 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx`（10/10）；真实 Surface 在 manual policy 下注册 `Mod-s`，只保存当前文档 |
| KW-US-124 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx`（10/10）；输入、blur、idle 与 rerender 均不触发 ResourceIO write |
| KW-US-125 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx`（10/10）；未提供 Save All，保存调用只携带目标文档的精确知识地址 |
| KW-US-126 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx`（10/10）；同址两 view 共享 registry buffer，任一 view 保存共享最新文本并共同推进 baseline |
| KW-US-127 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx`（10/10）；write 使用最近成功 load/save 的 provider-neutral expected version，写入异常不推进 version |
| KW-US-128 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx`（10/10）；保存成功保持静默并保留共享 undo history |
| KW-US-129 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx`（10/10）；冲突/不可用异常保留 buffer、旧 baseline、dirty 与所有共享 view 状态 |
| KW-US-130 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx`（10/10）；异常以持久非模态 alert 呈现，可手动关闭且编辑焦点不被夺取 |
| KW-US-131 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx`（10/10）；重复冲突更新同一 session/document 通知，不堆叠多条 alert |
| KW-US-132 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx`（10/10）；后续成功只清除该文档 saveError，不影响其他文档通知 |
| KW-US-133 | 21 | `desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx` | E2E-KW-007 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx`（1 file、10/10）；clean 外部正文/格式变化 stat-first 自动重载，来源级无关事件不制造假冲突，stale response 不覆盖新状态 |
| KW-US-134 | 21 | `desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx` | E2E-KW-007 | 通过 | 精确命令 `npx vitest run desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx`（10/10）；dirty 时原子保留 baseline/local/disk、diskVersion/diskFormat，继续编辑更新 local，直接保存被阻断 |
| KW-US-135 | 21 | `desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx` | E2E-KW-007 | 通过 | 精确命令 `npx vitest run desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx`（10/10）；merge/local/disk 三个显式动作全部进入同一手动保存执行器，写入不可用时不丢所选 buffer |
| KW-US-136 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 通过 | `npx vitest run tests/knowledge-workspace-lifecycle.test.ts desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx`（25/25）；原址不可写时只列当前 workspace 可用可写来源，并要求用户选择新 Page 地址 |
| KW-US-137 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 通过 | `npx vitest run tests/knowledge-workspace-lifecycle.test.ts desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx`（25/25）；原子新建成功后当前 session、全部 view、tab 与 breadcrumb 重绑到新知识地址 |
| KW-US-138 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 通过 | `npx vitest run tests/knowledge-workspace-lifecycle.test.ts desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx`（25/25）；orphan 保存仅创建并重绑当前文档，不触发旧地址引用重写 |
| KW-US-139 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 通过 | `npx vitest run tests/knowledge-workspace-lifecycle.test.ts desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx`（25/25）；`expectedVersion: null` 原子创建拒绝既有或已打开目标，保留对话框与 buffer |
| KW-US-140 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 通过 | `npx vitest run tests/knowledge-workspace-lifecycle.test.ts desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx`（25/25）；最后 view 的 dirty 决策与统一关闭流一致 |
| KW-US-141 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 通过 | `npx vitest run tests/knowledge-workspace-lifecycle.test.ts desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx`（25/25）；退出/切换按稳定文档顺序逐项等待保存、放弃或取消 |
| KW-US-142 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 通过 | `npx vitest run tests/knowledge-workspace-lifecycle.test.ts desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx`（25/25）；任一取消或写入异常立即停止，已完成结果不回滚且并发请求不替换当前决策 |
| KW-US-143 | 10 | `tests/knowledge-operation-tracer.test.ts`<br>`tests/knowledge-operation-journal.test.ts`<br>`tests/knowledge-operation-recovery.test.ts` | 契约/集成 | 通过 | `npx vitest run tests/knowledge-operation-tracer.test.ts tests/knowledge-operation-journal.test.ts tests/knowledge-operation-recovery.test.ts`（22/22）；UUIDv4/canonical hash/TTL、锁与幂等、checkpoint/rollback、启动恢复、projection 重放及脱敏结果均通过 |
| KW-US-144 | 55 | `tests/knowledge-trash-delete.test.ts`<br>`tests/knowledge-trash-crash-recovery.test.ts` | E2E-KW-020 | 未执行 | — |
| KW-US-145 | 55 | `tests/knowledge-trash-delete.test.ts`<br>`tests/knowledge-trash-crash-recovery.test.ts` | E2E-KW-020 | 未执行 | — |
| KW-US-146 | 55 | `tests/knowledge-trash-delete.test.ts`<br>`tests/knowledge-trash-crash-recovery.test.ts` | E2E-KW-020 | 未执行 | — |
| KW-US-147 | 55 | `tests/knowledge-trash-delete.test.ts`<br>`tests/knowledge-trash-crash-recovery.test.ts` | E2E-KW-020 | 未执行 | — |
| KW-US-148 | 55 | `tests/knowledge-trash-delete.test.ts`<br>`tests/knowledge-trash-crash-recovery.test.ts` | E2E-KW-020 | 未执行 | — |
| KW-US-149 | 56 | `tests/knowledge-trash-restore.test.ts`<br>`tests/knowledge-native-trash.test.ts` | E2E-KW-020 | 未执行 | — |
| KW-US-150 | 56 | `tests/knowledge-trash-restore.test.ts`<br>`tests/knowledge-native-trash.test.ts` | E2E-KW-020 | 未执行 | — |
| KW-US-151 | 56 | `tests/knowledge-trash-restore.test.ts`<br>`tests/knowledge-native-trash.test.ts` | E2E-KW-020 | 未执行 | — |
| KW-US-152 | 56 | `tests/knowledge-trash-restore.test.ts`<br>`tests/knowledge-native-trash.test.ts` | E2E-KW-020 | 未执行 | — |
| KW-US-153 | 56 | `tests/knowledge-trash-restore.test.ts`<br>`tests/knowledge-native-trash.test.ts` | E2E-KW-020 | 未执行 | — |
| KW-US-154 | 56 | `tests/knowledge-trash-restore.test.ts`<br>`tests/knowledge-native-trash.test.ts` | E2E-KW-020 | 未执行 | — |
| KW-US-155 | 56 | `tests/knowledge-trash-restore.test.ts`<br>`tests/knowledge-native-trash.test.ts` | E2E-KW-020 | 未执行 | — |
| KW-US-156 | 17 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 | 通过 | `npx vitest run tests/resource-open-policy.test.ts desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`（2 files、23/23）；安全文本、图片、PDF、音频、视频与文件信息只读表面通过 |
| KW-US-157 | 42 | `tests/safe-text-index-extractor.test.ts` | E2E-KW-013 | 未执行 | — |
| KW-US-158 | 17 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 | 通过 | `npx vitest run tests/resource-open-policy.test.ts desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`；不安全编码显示文件信息，默认应用动作只接收知识地址 |
| KW-US-159 | 17 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 | 通过 | `npx vitest run tests/resource-open-policy.test.ts desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`；10 MiB + 1 在 stat 后零正文 read |
| KW-US-160 | 17 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 | 通过 | `npx vitest run tests/resource-open-policy.test.ts desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`；PDF 只读预览且未调用索引/OCR/高亮能力 |
| KW-US-161 | 17 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 | 通过 | `npx vitest run tests/resource-open-policy.test.ts desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`；自动刷新、取消/stale guard、滚动与媒体位置恢复通过 |
| KW-US-162 | 17 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 | 通过 | `npx vitest run tests/resource-open-policy.test.ts desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`；外部删除保留查看器且无 write/create/路径猜测 |
| KW-US-163 | 03 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 | 通过 | `volta run npx vitest run tests/knowledge-contract-schema.test.ts tests/knowledge-open-full-composition.test.ts tests/resource-io-route.test.ts`（135/135，契约/集成）；未认证、伪造 authority、无 owner/scope、越出来源均被安全拒绝 |
| KW-US-164 | 03 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 | 通过 | `volta run npx vitest run tests/knowledge-contract-schema.test.ts tests/knowledge-open-full-composition.test.ts tests/resource-io-route.test.ts`（135/135，契约/集成）；Open/Full 均由隔离临时环境中的真实 Node Server 验证 |
| KW-US-165 | 51 | `tests/knowledge-native-contract.test.ts`<br>`tests/knowledge-import.test.ts`<br>`desktop/src/react/__tests__/services/knowledge-native-client.test.ts` | E2E-KW-017 | 未执行 | — |
| KW-US-166 | 18 | `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts` | E2E-KW-004, E2E-KW-024 | 通过 | `npx vitest run desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts`（10/10）；显式 owner/window factory 隔离三套 registry，无模块 singleton、DOM/EditorView/file handle 或浮动窗口入口 |
| KW-US-167 | 15 | `desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx`<br>`tests/knowledge-i18n-a11y-contract.test.ts` | E2E-KW-001, E2E-KW-023 | 通过 | 精确 Vitest 6/6；`npx playwright test tests/knowledge-workspace-e2e/E2E-KW-001-shell.spec.ts --project=desktop-full`（2/2）；来源、树与空编辑区的真实 Electron 布局通过 |
| KW-US-168 | 15 | `desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx`<br>`tests/knowledge-i18n-a11y-contract.test.ts` | E2E-KW-001, E2E-KW-023 | 通过 | `npx vitest run desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx tests/knowledge-i18n-a11y-contract.test.ts`（6/6）；desktop-full 2/2、web-open 1/1；workspace 切换取消、状态清空、旧来源遮蔽、错误重试及 Chat/Knowledge 隔离通过 |
| KW-US-169 | 15 | `desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx`<br>`tests/knowledge-i18n-a11y-contract.test.ts` | E2E-KW-001, E2E-KW-023 | 通过 | `npx playwright test tests/knowledge-workspace-e2e/E2E-KW-001-shell.spec.ts --project=desktop-full`（2/2）；E2E-KW-023 覆盖五语言、亮暗主题、窄布局、键盘 focus、ARIA 与单一编辑组 |
| KW-US-170 | 04 | `tests/knowledge-diagnostics.test.ts` | 契约/集成 | 通过 | `volta run npx vitest run tests/knowledge-diagnostics.test.ts tests/resource-events-ws.test.ts tests/resource-io-route.test.ts` 及相关 ResourceIO/Renderer 回归（22 files、249/249）；稳定错误码/HTTP/retryable、诊断脱敏、恶意对象安全拒绝与无路径 resync 恢复链均通过 |
| KW-US-171 | 14 | `tests/knowledge-malicious-workspace.test.ts`<br>`tests/knowledge-threat-control-matrix.test.ts` | E2E-KW-022 | 通过 | `npx vitest run tests/knowledge-malicious-workspace.test.ts tests/knowledge-threat-control-matrix.test.ts`（2 files、13/13，macOS arm64）；真实 symlink 越界/循环/TOCTOU、原生 case/Unicode、控制字符/盘符/UNC、伪造身份、LAN 错误脱敏、stat-before-read、HTML/SVG/URI、图片与 Mermaid 主动内容均默认拒绝；E2E-KW-022 仅关联追踪，不属于本票 Playwright 门禁 |
| KW-US-172 | 03 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 | 通过 | Ticket 03 精确命令（135/135，契约/集成）及 Open export 回归（52/52）；`build:server:open`、`smoke:server:open` 通过 |
| KW-US-173 | 03 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 | 通过 | `volta run npx vitest run tests/knowledge-contract-schema.test.ts tests/knowledge-open-full-composition.test.ts tests/resource-io-route.test.ts`（135/135，契约/集成）；Open/Full 共享协议相同且 Full-only 差异仅由 composition 注入；一次性测试签名下 full build 通过 |
| KW-US-174 | 25 | `tests/frontmatter-roundtrip.test.ts` | 契约/集成 | 通过 | `npx vitest run tests/frontmatter-roundtrip.test.ts`（24/24）；共享 IR + `js-yaml` 校验唯一顶层 JSON scalar/flat-array 属性，增改删各一个 CM6 transaction，未触及注释/顺序/LF/CRLF/正文保持，复杂或不确定 YAML 整区保留源码 |
| KW-US-175 | 26 | `tests/knowledge-tags-tasks.test.ts` | E2E-KW-013 | 通过 | `npx vitest run tests/knowledge-tags-tasks.test.ts`（16/16）；Frontmatter string/string[] 与 body 共享 IR 按 NFC、精确大小写值和 origin 聚合，空值/控制字符/复杂 YAML 拒绝，相同标签投影固定携带独立 `sourceKey`；发布级 E2E-KW-013 由完整入口统一回填 |
| KW-US-176 | 26 | `tests/knowledge-tags-tasks.test.ts` | 契约/集成 | 通过 | `npx vitest run tests/knowledge-tags-tasks.test.ts`（16/16）；只装饰共享 IR GFM marker，`[ ]`/`[x]` 单 transaction 写回及单步撤销、`[X]` 读取、陈旧位置、只读与 dispatch 故障均有直接证明 |
| KW-US-177 | 24 | `tests/knowledge-link-resolver.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-link-field.test.ts` | E2E-KW-009 | 通过 | `npx vitest run desktop/src/react/__tests__/editor/knowledge-link-field.test.ts desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx tests/markdown-knowledge-ir.test.ts tests/knowledge-link-resolver.test.ts`（5 files、67/67）；页面目录相对 `../`、percent 名称、fragment、非法编码/scheme、越界与不存在目标均经共享 resolver 闭合拒绝 |
| KW-US-178 | 50 | `tests/knowledge-create-service.test.ts`<br>`desktop/src/react/__tests__/components/CreateResourceDialog.test.tsx` | E2E-KW-016 | 未执行 | — |
| KW-US-179 | 50 | `tests/knowledge-create-service.test.ts`<br>`desktop/src/react/__tests__/components/CreateResourceDialog.test.tsx` | E2E-KW-016 | 未执行 | — |
| KW-US-180 | 51 | `tests/knowledge-native-contract.test.ts`<br>`tests/knowledge-import.test.ts` | E2E-KW-017 | 未执行 | — |
| KW-US-181 | 51 | `tests/knowledge-import.test.ts` | E2E-KW-017 | 未执行 | — |
| KW-US-182 | 52 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/stores/knowledge-clipboard-slice.test.ts` | E2E-KW-018 | 未执行 | — |
| KW-US-183 | 52 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/stores/knowledge-clipboard-slice.test.ts` | E2E-KW-018 | 未执行 | — |
| KW-US-184 | 53 | `tests/knowledge-drag-contract.test.ts`<br>`desktop/src/react/__tests__/components/knowledge-drag-controller.test.ts` | E2E-KW-018 | 未执行 | — |
| KW-US-185 | 53 | `desktop/src/react/__tests__/components/knowledge-drag-controller.test.ts` | E2E-KW-018 | 未执行 | — |
| KW-US-186 | 54 | `tests/knowledge-refactor-rollback.test.ts`<br>`tests/knowledge-refactor-crash-recovery.test.ts` | E2E-KW-019 | 未执行 | — |
| KW-US-187 | 40 | `tests/knowledge-index-store.test.ts`<br>`tests/knowledge-index-schema-migration.test.ts` | E2E-KW-013, E2E-KW-014 | 未执行 | — |
| KW-US-188 | 45 | `tests/knowledge-search-query.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSearch.test.tsx` | E2E-KW-013 | 未执行 | — |
| KW-US-189 | 45 | `tests/knowledge-search-query.test.ts` | E2E-KW-013 | 未执行 | — |
| KW-US-190 | 45 | `desktop/src/react/__tests__/components/KnowledgeSearch.test.tsx` | E2E-KW-013 | 未执行 | — |
| KW-US-191 | 46 | `desktop/src/react/__tests__/components/KnowledgeCurrentResourceViews.test.tsx` | E2E-KW-013 | 未执行 | — |
| KW-US-192 | 46 | `tests/knowledge-query-api.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeCurrentResourceViews.test.tsx` | E2E-KW-013 | 未执行 | — |
| KW-US-193 | 43 | `tests/knowledge-index-rebuild.test.ts`<br>`tests/knowledge-index-event-coordinator.test.ts` | E2E-KW-014 | 未执行 | — |

## Rule evidence

| Rule | Tickets | Status | Artifact/command |
|---|---|---|---|
| KW-RULE-LICENSE | 02 | 通过 | `SILVERBULLET_REFERENCE_REQUIRED=1 SILVERBULLET_REFERENCE_ROOT=<repo-root> volta run npx vitest run tests/silverbullet-reference-integrity.test.ts`（5/5，无 skip）；`volta run npm run typecheck`；`volta run npm run lint:boundary` |
| KW-RULE-RESOURCE | 03, 05, 06, 07, 08, 09 | 通过 | Ticket 03 契约/route/composition 135/135；Ticket 05 SourceRegistry/Provider identity/公开 route 40/40；Ticket 06 ResourceIO HTTP/transfer、持久化与 composition 定向 14 files、172/172；Ticket 07 统一 Server/Desk/Workbench main、provider `openRead`/Range、远程路径脱敏与 mount 换根故障注入，定向 15 files、165/165；Ticket 08 唯一 Renderer knowledge client、独立空白 Knowledge 会话状态、地址授权/越界防护、串行 catch-up/live 与 gap/epoch 权威恢复，定向 11 files、193/193；Ticket 09 Mobile/LAN 共享 DTO、来源隔离、provider-neutral transfer、租约 watcher、权限/取消/冲突/不可用与清理故障注入，定向 12 files、274/274；干净全仓（排除用户本地 ignored `temp/**`/`teach/**`）1010 files passed、1 skipped，10161 tests passed、6 skipped；typecheck、boundary、目标 ESLint、Renderer 与 Open Server build 通过 |
| KW-RULE-OBS | 04, 10, 43 | 部分通过（Tickets 04、10） | Ticket 04 相关回归 249/249；Ticket 10 operation/journal/recovery 22/22、相关定向 255/255；稳定错误/诊断、同一 operation correlation、watch sequence/cursor、rollback 与无路径 resync 已验证；Ticket 43 尚未执行 |
| KW-RULE-OP | 10, 50, 51, 52, 53, 54, 55, 56 | 部分通过（Ticket 10） | Operation plan/journal/recovery 22/22；UUIDv4、canonical request hash、15 分钟 TTL、地址锁、expected-version、幂等 commit、checkpoint、逐项结果、取消/冲突/权限/不可用与命名故障注入已验证；Tickets 50–56 尚未执行 |
| KW-RULE-MARKDOWN | 11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39 | 部分通过（Tickets 11、12、23、24、25、26、27、28、29、30、31、32、33、34） | Tickets 11–32 的共享 IR/Surface/address/link/Frontmatter/tags/tasks/Live Preview/事务/table/code/wrap/status 证据保持；Ticket 33 精确 13/13、相关 152/152；Ticket 34 精确+IR 27/27、相关 90/90。脚注 exact-label first-wins IR、多行定义、代码排除、reference/inline hover/jump/reveal、missing/duplicate、Source literal、local completion/undo、静态净化与五语言键盘 UI 已验证；Tickets 35–39 尚未执行 |
| KW-RULE-PERF | 13 | 预算/夹具契约通过；产品测量未执行 | `volta run npx vitest run tests/knowledge-performance-fixtures.test.ts tests/knowledge-performance-budget.test.ts`（31/31）；真实产品场景将在其 owner tickets 与 Ticket 57 执行，不以 harness 冒充性能通过 |
| KW-RULE-SEC | 14, 17, 35, 51, 54, 55, 56 | 部分通过（Tickets 14、17） | Ticket 14 恶意工作区门禁 13/13；Ticket 17 stat-first asset policy/查看器 23/23，HTML/SVG/Mermaid/URI 与超限内容零读取，严格 BOM 解码、取消、版本漂移和媒体失败 fail-closed；Tickets 35、51、54–56 及 Windows/Linux 平台矩阵尚未执行 |
| KW-RULE-INDEX | 40, 41, 42, 43 | 未执行 | — |
| KW-RULE-QUERY | 44, 46 | 未执行 | — |
| KW-RULE-SEARCH | 45 | 未执行 | — |
| KW-RULE-VIEW | 46 | 未执行 | — |
| KW-RULE-COPY | 38 | 未执行 | — |
| KW-RULE-CREATE | 50 | 未执行 | — |
| KW-RULE-IMPORT | 51 | 未执行 | — |
| KW-RULE-CLIPBOARD | 52 | 未执行 | — |
| KW-RULE-DND | 53 | 未执行 | — |
| KW-RULE-REFACTOR | 54 | 未执行 | — |
| KW-RULE-RELEASE | 57 | 未执行 | — |
| KW-RULE-PREFLIGHT | 01 | 通过 | `SILVERBULLET_REFERENCE_ROOT=<repo-root> volta run npx vitest run tests/knowledge-baseline-contract.test.ts tests/knowledge-preflight.test.ts`（17/17）；Node v24.16.0；真实 SQLite FTS5；dirty 仅 warning |
| KW-RULE-NATIVE | 17, 51, 56 | 部分通过（Ticket 17） | Asset Viewer 默认应用接缝只传 `KnowledgeResourceAddress`，无动作/Open/Web 显式返回 capability unavailable；不暴露绝对路径或建立任意路径 IPC。grant、Main-only credential、picker/reveal/trash 与真实系统动作等待 Tickets 51、56 |
| KW-RULE-RECOVERY | 10, 43, 54, 55, 56 | 部分通过（Ticket 10） | Operation Journal 原子写/`.prev` 回退、rollback、`RECOVERY_REQUIRED`、启动 barrier、缺失终态结果重建、projection 重放及 source `recovering` 聚合由 22/22 精确测试证明；Tickets 43、54–56 尚未执行 |
| KW-RULE-TEST | 01, 13, 14, 57 | 部分通过（Tickets 01、13、14） | Ticket 01 preflight/baseline 17/17；Ticket 13 性能 fixture/evidence 31/31；Ticket 14 恶意工作区/威胁矩阵 13/13、全仓 10211 tests passed；Ticket 57 尚未执行 |

## E2E projects

| Scenario | desktop-full | web-open | web-full | Platforms/artifacts |
|---|---|---|---|---|
| E2E-KW-001 | 通过 | 通过 | 不适用 | macOS arm64；`npx playwright test tests/knowledge-workspace-e2e/E2E-KW-001-shell.spec.ts --project=desktop-full` 与 `--project=web-open`；desktop-full 2/2（含 E2E-KW-023），web-open 1/1 |
| E2E-KW-002 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-003 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-004 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-005 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-006 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-007 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-008 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-009 | 未执行 | 未执行 | 未执行 | 依赖 Tickets 37、39、48 的补全/延迟建页、embed/backlink 与真实资源打开入口；当前不以私有 route 或缩减场景替代发布流程 |
| E2E-KW-010 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-011 | 未执行 | 未执行 | 未执行 | 依赖 Tickets 48/49 的资源树单击/双击/Enter/Space 真实打开入口；当前仓库无该 spec，不以私有 route 或缩减场景替代，最终发布前必须回填 |
| E2E-KW-012 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-013 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-014 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-015 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-016 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-017 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-018 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-019 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-020 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-021 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-022 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-023 | 通过 | 不适用 | 不适用 | macOS arm64 desktop-full；五语言、亮暗主题、窄布局、键盘 focus、ARIA 与单一空编辑组通过 |
| E2E-KW-024 | 未执行 | 未执行 | 未执行 | — |

## Performance

| Profile | Status | Result JSON | Regression baseline |
|---|---|---|---|
| reference-v1 | 未执行 | — | — |

## Security

| Threat | Status | Artifact |
|---|---|---|
| TM-001 | 部分通过（macOS 基线） | 真实 symlink 越界与循环 fail-closed；Windows junction 尚未执行 |
| TM-002 | 部分通过（Ticket 14 基线） | `openRead(expectedVersion)` 与真实 TOCTOU 路径替换在产生正文前拒绝；Ticket 54 commit recheck 尚未执行 |
| TM-003 | 通过 | 盘符/UNC/控制字符地址拒绝，LAN 错误与日志不含本机路径、正文或 token；相关 route 回归 192/192 |
| TM-004 | 部分通过（macOS 基线） | 真实 APFS case/Unicode identity 与精确 relativePath 已执行；Windows/Linux 平台矩阵尚未执行 |
| TM-005 | 通过 | 控制字符、正文、token 与绝对路径错误/日志脱敏断言通过 |
| TM-006 | 部分通过（Ticket 14 基线） | HTML/SVG/event 与非 `http/https` URI 默认拒绝；Ticket 35 外链用户手势流程尚未执行 |
| TM-007 | 通过 | Ticket 14 基线与 Ticket 33 编辑字段均通过：固定 strict/secure config、顶层与 flowchart 无 HTML label、丢弃 bindFunctions、SVG element/attribute/fragment allowlist、root-ID scoped CSS declaration sanitizer、active URL/global selector/at-rule/animation/event/script/foreignObject 拒绝，以及 cache/cancel/stale-result guard |
| TM-008 | 部分通过（Tickets 14、17、19） | Server、Asset Viewer 与 Markdown Editor 均在正文前 stat；10 MiB + 1、active/unsupported 类型零 read，Markdown 超限时不创建 session/view；允许内容受实际字节数复验，取消、stale 结果与非法 UTF-8 均 fail-closed；Ticket 42 尚未执行 |
| TM-009 | 未执行 | — |
| TM-010 | 未执行 | — |
| TM-011 | 未执行 | — |
| TM-012 | 未执行 | — |
| TM-013 | 部分通过（Ticket 14 基线） | 普通 route 伪造 credential/token/window 字段在 provider 前拒绝；Ticket 51/56 原生 grant 流程尚未执行 |
| TM-014 | 部分通过（Ticket 14 矩阵） | no-follow、深度/条目/容量/cancel 控制已冻结并由矩阵门禁校验；Ticket 51 真实导入流程尚未执行 |
| TM-015 | 未执行 | — |
| TM-016 | 通过 | wrong owner/source/window 与无 owner/scope 路由回归通过，远程 DTO 保持 source-scoped |
| TM-017 | 未执行 | — |
| TM-018 | 部分通过（Ticket 14 基线） | 恶意工作区测试全部使用 `mkdtemp` 隔离 source/outside/HANA_HOME 并清理；Ticket 57 平台 runner 尚未执行 |
| TM-019 | 通过 | Knowledge/ResourceIO route 仅信任 Hono principal，伪造 principal/user/studio/owner/scope 字段在 provider 前拒绝 |
| TM-020 | 部分通过（Ticket 14 基线） | transfer 控制矩阵及既有 1 MiB chunk/4 streams/8 MiB buffer、取消/半目录/provider-pair 回归通过；Tickets 38、51–53 尚未执行 |

## Exceptions

- 2026-07-28 Ticket 16 首次执行未带范围排除的 `npx vitest run` 时，Vitest 额外收集了用户本地 ignored `temp/**` 中 8 个 Node test 文件，并因其不是 Vitest suite 退出 1；该次产品范围内 1019 files、10226 tests 全部通过。未修改用户内容；随后实际门禁命令 `npx vitest run --exclude 'temp/**' --exclude 'teach/**'` 通过（1019 files passed、1 skipped；10226 tests passed、6 skipped）。这是已解决的范围外测试发现，不构成产品豁免或发布 blocker。
- 2026-07-28 Ticket 17 的 E2E-KW-006、E2E-KW-017 尚未执行：当前代码交付 Asset Viewer 公共组件/策略，但真实用户入口分别依赖 Ticket 20/49 的编辑组与树打开语义，desktop native 动作依赖 Ticket 51。为避免私有 route/test shortcut 或提前形成平行打开/native 状态机，本票只登记 23/23 精确自动化；E2E 行保持“未执行”，待显式 blocker 完成后执行。这是有 owner 的暂存证据缺口，不能进入最终发布通过状态。
- 2026-07-28 Ticket 18 的 E2E-KW-004、E2E-KW-024 尚未执行：当前仓库只存在 E2E-KW-001 spec；E2E-KW-004 的真实 tabs/groups 入口由 Ticket 20 交付，E2E-KW-024 还依赖 Ticket 19/21/51 的保存、冲突与 native grant 链路。为避免私有测试入口或提前实现后续 owner 范围，本票登记 10/10 精确 registry 自动化并保持 E2E 行“未执行”；依赖完成后必须以真实产品入口回填，最终发布前不得保留此缺口。
- 2026-07-28 Ticket 19 的 E2E-KW-005 尚未执行：当前仓库只有 E2E-KW-001 spec，Markdown 文档的真实打开、活动 tab 与编辑组入口依赖 Ticket 20/49。为避免私有 route/test shortcut 或提前实现后续 owner 范围，本票登记精确 10/10、相关 38/38 与干净全仓 10269 tests passed；E2E 行保持“未执行”，待真实产品入口完成后执行，最终发布前不得保留此缺口。
- 2026-07-28 Ticket 20 的 E2E-KW-004 尚未执行：递归 groups/tabs、preview、全局复用、显式侧边 view 与 breadcrumb 组合层已进入真实 Knowledge shell，但资源树单击/双击/Space/Enter 的公开打开入口由 Tickets 48/49 拥有，仓库目前仍只有 E2E-KW-001 spec。为避免私有 route/test shortcut 或越权提前实现树交互，本票登记精确 8/8、相关 130/130 与干净全仓 10277 tests passed；依赖完成后必须通过真实产品入口执行 E2E-KW-004，最终发布前不得保留此缺口。
- 2026-07-28 Ticket 20 文档回填后的前两次 `npx vitest run tests/knowledge-baseline-contract.test.ts` 在隔离 child import 用例触及固定 10 秒超时；排查确认三个此前为提取全仓统计而启动、但因输出管道提前返回的 Vitest 进程仍在后台并行占用 CPU。只终止本轮启动的冗余测试进程后，同一基线命令立即通过（11/11，child import 926 ms），随后单一前台全仓命令通过。这是已解决的测试编排资源争用，不是产品断言失败或发布豁免。
- 2026-07-28 Ticket 20 全仓复验期间曾误传 `--reporter=basic`；Vitest 4 将其解析为无法加载的自定义 reporter，测试在 discovery 前退出。移除该无效参数后使用默认 reporter 的同一全仓命令通过（1025 files passed、1 skipped；10277 tests passed、6 skipped）。该记录仅说明命令更正，不属于产品测试失败或发布豁免。
- 2026-07-28 Ticket 21 的 E2E-KW-007 尚未执行：外部变化监听、clean reload、dirty 三方状态与显式 resolver 已进入真实 Knowledge groups 组合层，但真实资源树单击/双击/Space/Enter 打开 Markdown 的公开用户入口由 Tickets 48/49 拥有，仓库目前仍只有 E2E-KW-001 spec。为避免私有 route/test shortcut 或提前实现后续 owner，本票登记精确 10/10、相关 202/202 与产品范围全仓 10288 tests passed；依赖完成后必须通过真实产品入口执行 E2E-KW-007，最终发布前不得保留此缺口。
- 2026-07-29 Ticket 33 的 E2E-KW-011 尚未执行：Mermaid/math 静态字段已由精确 13/13、相关 152/152 与产品范围全仓 10530 tests passed 证明，但仓库尚无 E2E-KW-011 spec，且资源树单击/双击/Enter/Space 打开 Markdown 的公开产品入口由 Tickets 48/49 拥有。为避免私有 route/test shortcut 或缩减发布场景，本票保持 E2E 行“未执行”；48/49 完成后必须补建并执行，最终发布前不得保留此缺口。
- 2026-07-29 Ticket 33 最终标准全量门禁之前，为提取简洁汇总追加的 `--reporter=dot --silent=passed-only` 单 worker 诊断变体造成三个大文件 I/O 用例超时和一个 CM6 DOM 时序失败；同票精确/相关测试始终通过。停止该冗余变体后，最终实现提交上的标准并行命令 `npm test -- --exclude 'temp/**' --silent=passed-only` 明确通过（1045 files passed、1 skipped；10530 tests passed、6 skipped），其中上述四项均通过。这是已解决的测试编排资源争用，不是产品断言失败或发布豁免。
- 2026-07-29 Ticket 34 的 E2E-KW-011 尚未执行：脚注共享 IR、Live Preview、同文档跳转与补全已由 ticket 精确 7/7、共享 IR 20/20、相关 90/90 与产品范围全仓 10539 tests passed 证明，但仓库尚无 E2E-KW-011 spec，且资源树单击/双击/Enter/Space 打开 Markdown 的公开产品入口由 Tickets 48/49 拥有。为避免私有 route/test shortcut 或缩减场景，本票保持 E2E 行“未执行”；48/49 完成后必须补建并执行，最终发布前不得保留此缺口。
- 2026-07-29 Ticket 34 的补充参考门禁第一次把 `SILVERBULLET_REFERENCE_ROOT` 误设为仓库内 `silverbullet/`，而测试契约会自行追加 `silverbullet/package.json`，因此两个 suite 在 discovery 阶段明确拒绝配置；纠正为仓库根后 reference/preflight 11/11 通过。同批 baseline child import 受两个由桌面输出单元提前关闭但仍在后台执行的冗余全仓 Vitest 进程竞争而触及 10 秒 timeout；只终止本票启动的失联测试进程后，baseline 以 30 秒诊断上限 11/11 通过。该配置和编排错误未运行或修改产品状态，不构成发布豁免。
- 2026-07-29 Ticket 34 首次取得完整终态的标准并行全仓命令中，`knowledge-performance-fixtures`、`resource-io-local-fs-provider`、`resource-io-transfer` 三个大文件 I/O 用例触及各自固定 timeout；脚注精确/相关始终全绿，三个受影响文件立即隔离重跑 53/53。清空后台进程且不提高 timeout、不降低 worker 后，再次执行同一 `npm test -- --exclude 'temp/**' --silent=passed-only` 明确通过（1046 files passed、1 skipped；10539 tests passed、6 skipped）。这是已解决的 I/O 资源时序，不是产品断言失败或发布豁免。
- 除上述已记录事实外没有例外。任何未执行、失败或 flaky 项必须在这里记录事实、影响、owner 和阻断决定；不得写入 `LOG.md`。
