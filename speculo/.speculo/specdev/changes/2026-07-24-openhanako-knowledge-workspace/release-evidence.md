# 知识工作区发布证据

本文件是实施与发布证据的当前状态表，不是设计日志。初始状态均为“未执行”；Ticket 57 只能填入实际命令、artifact 和结果。

## 运行环境

| 项 | 值 |
|---|---|
| Commit | `e5257959`（Ticket 02 合并后验证点） |
| Branch | `hanakde` |
| Node/npm | Node `v24.16.0` / npm `11.13.0`（Volta） |
| OS/CPU/RAM/File system | macOS Darwin 25.5.0 / Apple M5 arm64 / 16 GiB / APFS |
| HANA_HOME | 临时隔离目录（执行时填写脱敏标识） |

## Requirement evidence

| Requirement | Owner | Automated evidence | E2E | Status | Artifact/command |
|---|---:|---|---|---|---|
| KW-US-001 | 05 | `tests/knowledge-source-registry.test.ts`<br>`tests/provider-root-identity.test.ts` | E2E-KW-003 | 未执行 | — |
| KW-US-002 | 05 | `tests/knowledge-source-registry.test.ts`<br>`tests/provider-root-identity.test.ts` | E2E-KW-003 | 未执行 | — |
| KW-US-003 | 23 | `tests/knowledge-link-resolver.test.ts` | E2E-KW-009 | 未执行 | — |
| KW-US-004 | 03 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 | 未执行 | — |
| KW-US-005 | 38 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 | 未执行 | — |
| KW-US-006 | 38 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 | 未执行 | — |
| KW-US-007 | 05 | `tests/knowledge-source-registry.test.ts`<br>`tests/provider-root-identity.test.ts` | E2E-KW-003 | 未执行 | — |
| KW-US-008 | 05 | `tests/knowledge-source-registry.test.ts`<br>`tests/provider-root-identity.test.ts` | E2E-KW-003 | 未执行 | — |
| KW-US-009 | 03 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 | 未执行 | — |
| KW-US-010 | 09 | `tests/mobile-workbench-route.test.ts`<br>`desktop/src/react/__tests__/mobile/knowledge-access.test.ts` | E2E-KW-021 | 未执行 | — |
| KW-US-011 | 15 | `desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx`<br>`tests/knowledge-i18n-a11y-contract.test.ts` | E2E-KW-001, E2E-KW-023 | 未执行 | — |
| KW-US-012 | 16 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-013 | 16 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx` | 契约/集成 | 未执行 | — |
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
| KW-US-030 | 16 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-031 | 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-032 | 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-033 | 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-034 | 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 | 未执行 | — |
| KW-US-035 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 未执行 | — |
| KW-US-036 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 未执行 | — |
| KW-US-037 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 未执行 | — |
| KW-US-038 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 未执行 | — |
| KW-US-039 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 未执行 | — |
| KW-US-040 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 未执行 | — |
| KW-US-041 | 18 | `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts` | E2E-KW-004, E2E-KW-024 | 未执行 | — |
| KW-US-042 | 18 | `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts` | E2E-KW-004, E2E-KW-024 | 未执行 | — |
| KW-US-043 | 18 | `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts` | E2E-KW-004, E2E-KW-024 | 未执行 | — |
| KW-US-044 | 18 | `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts` | E2E-KW-004, E2E-KW-024 | 未执行 | — |
| KW-US-045 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 未执行 | — |
| KW-US-046 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 未执行 | — |
| KW-US-047 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 未执行 | — |
| KW-US-048 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 未执行 | — |
| KW-US-049 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 未执行 | — |
| KW-US-050 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 未执行 | — |
| KW-US-051 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 未执行 | — |
| KW-US-052 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 未执行 | — |
| KW-US-053 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 未执行 | — |
| KW-US-054 | 20 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 | 未执行 | — |
| KW-US-055 | 27 | `desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts` | E2E-KW-005 | 未执行 | — |
| KW-US-056 | 27 | `desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts` | E2E-KW-005 | 未执行 | — |
| KW-US-057 | 12 | `desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-058 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 未执行 | — |
| KW-US-059 | 28 | `desktop/src/react/__tests__/editor/knowledge-enter-commands.test.ts` | 契约/集成 | 未执行 | — |
| KW-US-060 | 28 | `desktop/src/react/__tests__/editor/knowledge-enter-commands.test.ts` | 契约/集成 | 未执行 | — |
| KW-US-061 | 29 | `desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts` | 契约/集成 | 未执行 | — |
| KW-US-062 | 29 | `desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts` | 契约/集成 | 未执行 | — |
| KW-US-063 | 29 | `desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts` | 契约/集成 | 未执行 | — |
| KW-US-064 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-065 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-066 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-067 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-068 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-069 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-070 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-071 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-072 | 30 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-073 | 31 | `desktop/src/react/__tests__/editor/knowledge-table-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts` | 契约/集成 | 未执行 | — |
| KW-US-074 | 31 | `desktop/src/react/__tests__/editor/knowledge-table-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts` | 契约/集成 | 未执行 | — |
| KW-US-075 | 31 | `desktop/src/react/__tests__/editor/knowledge-table-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts` | 契约/集成 | 未执行 | — |
| KW-US-076 | 31 | `desktop/src/react/__tests__/editor/knowledge-table-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts` | 契约/集成 | 未执行 | — |
| KW-US-077 | 32 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-078 | 32 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-079 | 32 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-080 | 32 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-081 | 32 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-082 | 32 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-083 | 32 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 | 未执行 | — |
| KW-US-084 | 33 | `desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-math-field.test.ts` | E2E-KW-011 | 未执行 | — |
| KW-US-085 | 33 | `desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-math-field.test.ts` | E2E-KW-011 | 未执行 | — |
| KW-US-086 | 33 | `desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-math-field.test.ts` | E2E-KW-011 | 未执行 | — |
| KW-US-087 | 33 | `desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-math-field.test.ts` | E2E-KW-011 | 未执行 | — |
| KW-US-088 | 34 | `desktop/src/react/__tests__/editor/knowledge-footnote-field.test.ts` | E2E-KW-011 | 未执行 | — |
| KW-US-089 | 34 | `desktop/src/react/__tests__/editor/knowledge-footnote-field.test.ts` | E2E-KW-011 | 未执行 | — |
| KW-US-090 | 34 | `desktop/src/react/__tests__/editor/knowledge-footnote-field.test.ts` | E2E-KW-011 | 未执行 | — |
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
| KW-US-114 | 24 | `desktop/src/react/__tests__/editor/knowledge-link-field.test.ts` | E2E-KW-009 | 未执行 | — |
| KW-US-115 | 38 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 | 未执行 | — |
| KW-US-116 | 38 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 | 未执行 | — |
| KW-US-117 | 38 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 | 未执行 | — |
| KW-US-118 | 38 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 | 未执行 | — |
| KW-US-119 | 23 | `tests/knowledge-link-resolver.test.ts` | E2E-KW-009 | 未执行 | — |
| KW-US-120 | 39 | `desktop/src/react/__tests__/editor/knowledge-embed-field.test.ts` | E2E-KW-009 | 未执行 | — |
| KW-US-121 | 37 | `desktop/src/react/__tests__/editor/knowledge-link-completion.test.ts`<br>`desktop/src/react/__tests__/commands/knowledge-link-navigation.test.ts` | E2E-KW-009 | 未执行 | — |
| KW-US-122 | 35 | `tests/knowledge-safe-links.test.ts`<br>`desktop/src/react/__tests__/utils/knowledge-safe-rendering.test.ts` | E2E-KW-011 | 未执行 | — |
| KW-US-123 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 未执行 | — |
| KW-US-124 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 未执行 | — |
| KW-US-125 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 未执行 | — |
| KW-US-126 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 未执行 | — |
| KW-US-127 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 未执行 | — |
| KW-US-128 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 未执行 | — |
| KW-US-129 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 未执行 | — |
| KW-US-130 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 未执行 | — |
| KW-US-131 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 未执行 | — |
| KW-US-132 | 19 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 | 未执行 | — |
| KW-US-133 | 21 | `desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx` | E2E-KW-007 | 未执行 | — |
| KW-US-134 | 21 | `desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx` | E2E-KW-007 | 未执行 | — |
| KW-US-135 | 21 | `desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx` | E2E-KW-007 | 未执行 | — |
| KW-US-136 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 未执行 | — |
| KW-US-137 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 未执行 | — |
| KW-US-138 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 未执行 | — |
| KW-US-139 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 未执行 | — |
| KW-US-140 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 未执行 | — |
| KW-US-141 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 未执行 | — |
| KW-US-142 | 22 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 | 未执行 | — |
| KW-US-143 | 10 | `tests/knowledge-operation-tracer.test.ts`<br>`tests/knowledge-operation-journal.test.ts`<br>`tests/knowledge-operation-recovery.test.ts` | 契约/集成 | 未执行 | — |
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
| KW-US-156 | 17 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 | 未执行 | — |
| KW-US-157 | 42 | `tests/safe-text-index-extractor.test.ts` | E2E-KW-013 | 未执行 | — |
| KW-US-158 | 17 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 | 未执行 | — |
| KW-US-159 | 17 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 | 未执行 | — |
| KW-US-160 | 17 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 | 未执行 | — |
| KW-US-161 | 17 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 | 未执行 | — |
| KW-US-162 | 17 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 | 未执行 | — |
| KW-US-163 | 03 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 | 未执行 | — |
| KW-US-164 | 03 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 | 未执行 | — |
| KW-US-165 | 51 | `tests/knowledge-native-contract.test.ts`<br>`tests/knowledge-import.test.ts`<br>`desktop/src/react/__tests__/services/knowledge-native-client.test.ts` | E2E-KW-017 | 未执行 | — |
| KW-US-166 | 18 | `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts` | E2E-KW-004, E2E-KW-024 | 未执行 | — |
| KW-US-167 | 15 | `desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx`<br>`tests/knowledge-i18n-a11y-contract.test.ts` | E2E-KW-001, E2E-KW-023 | 未执行 | — |
| KW-US-168 | 15 | `desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx`<br>`tests/knowledge-i18n-a11y-contract.test.ts` | E2E-KW-001, E2E-KW-023 | 未执行 | — |
| KW-US-169 | 15 | `desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx`<br>`tests/knowledge-i18n-a11y-contract.test.ts` | E2E-KW-001, E2E-KW-023 | 未执行 | — |
| KW-US-170 | 04 | `tests/knowledge-diagnostics.test.ts` | 契约/集成 | 未执行 | — |
| KW-US-171 | 14 | `tests/knowledge-malicious-workspace.test.ts`<br>`tests/knowledge-threat-control-matrix.test.ts` | E2E-KW-022 | 未执行 | — |
| KW-US-172 | 03 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 | 未执行 | — |
| KW-US-173 | 03 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 | 未执行 | — |
| KW-US-174 | 25 | `tests/frontmatter-roundtrip.test.ts` | 契约/集成 | 未执行 | — |
| KW-US-175 | 26 | `tests/knowledge-tags-tasks.test.ts` | E2E-KW-013 | 未执行 | — |
| KW-US-176 | 26 | `tests/knowledge-tags-tasks.test.ts` | 契约/集成 | 未执行 | — |
| KW-US-177 | 24 | `tests/knowledge-link-resolver.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-link-field.test.ts` | E2E-KW-009 | 未执行 | — |
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
| KW-RULE-RESOURCE | 03, 05, 06, 07, 08, 09 | 未执行 | — |
| KW-RULE-OBS | 04, 10, 43 | 未执行 | — |
| KW-RULE-OP | 10, 50, 51, 52, 53, 54, 55, 56 | 未执行 | — |
| KW-RULE-MARKDOWN | 11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39 | 未执行 | — |
| KW-RULE-PERF | 13 | 未执行 | — |
| KW-RULE-SEC | 14, 17, 35, 51, 54, 55, 56 | 未执行 | — |
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
| KW-RULE-PREFLIGHT | 01 | 未执行 | — |
| KW-RULE-NATIVE | 17, 51, 56 | 未执行 | — |
| KW-RULE-RECOVERY | 10, 43, 54, 55, 56 | 未执行 | — |
| KW-RULE-TEST | 01, 13, 14, 57 | 未执行 | — |

## E2E projects

| Scenario | desktop-full | web-open | web-full | Platforms/artifacts |
|---|---|---|---|---|
| E2E-KW-001 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-002 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-003 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-004 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-005 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-006 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-007 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-008 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-009 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-010 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-011 | 未执行 | 未执行 | 未执行 | — |
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
| E2E-KW-023 | 未执行 | 未执行 | 未执行 | — |
| E2E-KW-024 | 未执行 | 未执行 | 未执行 | — |

## Performance

| Profile | Status | Result JSON | Regression baseline |
|---|---|---|---|
| reference-v1 | 未执行 | — | — |

## Security

| Threat | Status | Artifact |
|---|---|---|
| TM-001 | 未执行 | — |
| TM-002 | 未执行 | — |
| TM-003 | 未执行 | — |
| TM-004 | 未执行 | — |
| TM-005 | 未执行 | — |
| TM-006 | 未执行 | — |
| TM-007 | 未执行 | — |
| TM-008 | 未执行 | — |
| TM-009 | 未执行 | — |
| TM-010 | 未执行 | — |
| TM-011 | 未执行 | — |
| TM-012 | 未执行 | — |
| TM-013 | 未执行 | — |
| TM-014 | 未执行 | — |
| TM-015 | 未执行 | — |
| TM-016 | 未执行 | — |
| TM-017 | 未执行 | — |
| TM-018 | 未执行 | — |
| TM-019 | 未执行 | — |
| TM-020 | 未执行 | — |

## Exceptions

没有例外。任何未执行、失败或 flaky 项必须在这里记录事实、影响、owner 和阻断决定；不得写入 `LOG.md`。
