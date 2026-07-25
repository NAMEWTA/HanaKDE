# 需求追踪矩阵

本矩阵是需求 ownership 的可读权威表。每条用户故事只有一个 Primary Owner；supporting ticket 可以复用或提供接缝，但不能替代 owner 实现。Ticket 57 只汇总实际证据。各 `ticket/*` 的「需求追踪」行必须与本表 Primary owner 列一致。E2E 列表示发布级用户流程的追踪关系，不表示 Primary Owner 或 supporting ticket 必须运行 Playwright；ticket 是否运行 Playwright 以其“Playwright 用户流程”声明为准，其他情况使用 Vitest。

| Requirement ID | 需求 | Primary owner | Supporting tickets | 自动化证据 | E2E |
|---|---|---:|---|---|---|
| KW-US-001 | 作为用户，我希望当前工作目录成为 `main`，并可挂载其他真实目录用于浏览、编辑、搜索和复制。 | 05 | 03, 06, 07, 08, 09, 10 | `tests/knowledge-source-registry.test.ts`<br>`tests/provider-root-identity.test.ts` | E2E-KW-003 |
| KW-US-002 | 作为重视边界的用户，我希望 `main` 与每个挂载源彼此隔离，以便一个来源中的链接、标签和反向引用不会意外关联另一来源。 | 05 | 03, 06, 07, 08, 09, 10 | `tests/knowledge-source-registry.test.ts`<br>`tests/provider-root-identity.test.ts` | E2E-KW-003 |
| KW-US-003 | 作为 Markdown 用户，我希望 Wikilink 只保存来源内规范相对路径，以便文件脱离 OpenHanako 后仍能在单个目录树中理解。 | 23 | 03, 05, 06, 07, 08, 09, 10 | `tests/knowledge-link-resolver.test.ts` | E2E-KW-009 |
| KW-US-004 | 作为多来源用户，我希望应用内部仍用 `sourceKey` 区分同名资源，但该 key 不污染 Markdown 正文。 | 03 | 05, 06, 07, 08, 09, 10 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 |
| KW-US-005 | 作为跨来源使用资料的用户，我希望将另一来源文件插入当前页面时先复制整个文件，再链接副本，以便来源之间不存在隐式依赖。 | 38 | 03, 05, 06, 07, 08, 09, 10 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 |
| KW-US-006 | 作为可移植性用户，我希望复制保持文件正文原样，链接失效时由我访问后自行修订，而不是应用批量猜测。 | 38 | 03, 05, 06, 07, 08, 09, 10 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 |
| KW-US-007 | 作为安全用户，我希望来源根真实路径不能重叠，路径解析永远不能越过当前来源 scope。 | 05 | 03, 06, 07, 08, 09, 10 | `tests/knowledge-source-registry.test.ts`<br>`tests/provider-root-identity.test.ts` | E2E-KW-003 |
| KW-US-008 | 作为重新挂载用户，我希望显式重选相同历史根时可以复用未占用的内部来源身份，但冲突时必须明确选择新的 key。 | 05 | 03, 06, 07, 08, 09, 10 | `tests/knowledge-source-registry.test.ts`<br>`tests/provider-root-identity.test.ts` | E2E-KW-003 |
| KW-US-009 | 作为隐私敏感用户，我希望远程 DTO 和 UI 不暴露不必要的本地绝对路径。 | 03 | 05, 06, 07, 08, 09, 10 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 |
| KW-US-010 | 作为多平台用户，我希望 Desktop、独立 Server、LAN 与 Mobile 对来源隔离和复制规则保持一致。 | 09 | 03, 05, 06, 07, 08, 10 | `tests/mobile-workbench-route.test.ts`<br>`desktop/src/react/__tests__/mobile/knowledge-access.test.ts` | E2E-KW-021 |
| KW-US-011 | 作为知识工作者，我希望从与聊天同级的知识视图进入完整知识工作区，以便集中浏览、组织和编辑长期资料。 | 15 | 16, 17, 47, 48, 49 | `desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx`<br>`tests/knowledge-i18n-a11y-contract.test.ts` | E2E-KW-001, E2E-KW-023 |
| KW-US-012 | 作为资源树用户，我希望看到主根目录与每个挂载源的真实文件夹、页面和资产，以便界面结构与磁盘结构保持一致。 | 16 | 15, 17, 47, 48, 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx` | 契约/集成 |
| KW-US-013 | 作为文件管理用户，我希望在资源树、编辑器标签、搜索结果和文件操作界面中看到完整原始文件名及扩展名，以便不会把不同格式或未知后缀误认为同一资源。 | 16 | 15, 17, 47, 48, 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx` | 契约/集成 |
| KW-US-014 | 作为浏览文件夹的用户，我希望单击文件夹只选择，点击箭头或双击才展开或折叠，以便能稳定选择文件操作目标而不意外改变树结构。 | 49 | 15, 16, 17, 47, 48 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 |
| KW-US-015 | 作为键盘用户，我希望用上下方向键在当前可见节点间单选导航，以便无需鼠标即可高效定位资源。 | 48 | 15, 16, 17, 47, 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.keyboard.test.tsx` | E2E-KW-015 |
| KW-US-016 | 作为键盘用户，我希望用左键折叠或返回父目录、用右键展开或进入首个可见子节点，以便获得符合桌面文件树习惯的层级导航。 | 48 | 15, 16, 17, 47, 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.keyboard.test.tsx` | E2E-KW-015 |
| KW-US-017 | 作为批量操作用户，我希望用 Shift 加方向键从固定锚点扩展或收缩连续范围，以便能够准确选择当前可见的连续资源。 | 48 | 15, 16, 17, 47, 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.keyboard.test.tsx` | E2E-KW-015 |
| KW-US-018 | 作为批量操作用户，我希望用 Ctrl/Cmd 加方向键只移动焦点，并用 Ctrl/Cmd+Space 切换非连续选择，以便可以建立不连续选择而不破坏已有集合。 | 48 | 15, 16, 17, 47, 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.keyboard.test.tsx` | E2E-KW-015 |
| KW-US-019 | 作为安全操作用户，我希望让一次资源树选择集只能属于一个内容来源，以便批量操作始终有单一来源、回收站和移动语义。 | 47 | 15, 16, 17, 48, 49 | `desktop/src/react/__tests__/components/resource-tree-selection.test.ts` | E2E-KW-015 |
| KW-US-020 | 作为安全操作用户，我希望在选择包含文件夹及其后代时自动只保留最外层祖先，以便同一磁盘对象不会被重复处理。 | 47 | 15, 16, 17, 48, 49 | `desktop/src/react/__tests__/components/resource-tree-selection.test.ts` | E2E-KW-015 |
| KW-US-021 | 作为资源树用户，我希望右键已选节点时保留选择集，右键未选节点时先单选该节点，以便上下文菜单总是作用于可解释的对象。 | 47 | 15, 16, 17, 48, 49 | `desktop/src/react/__tests__/components/resource-tree-selection.test.ts` | E2E-KW-015 |
| KW-US-022 | 作为资源树用户，我希望点击空白区域清除选择，以便能够明确结束当前批量操作上下文。 | 47 | 15, 16, 17, 48, 49 | `desktop/src/react/__tests__/components/resource-tree-selection.test.ts` | E2E-KW-015 |
| KW-US-023 | 作为快速浏览用户，我希望在文件节点上按 Space 打开或激活临时预览且焦点留在资源树，以便连续查看资源时不会制造大量固定标签。 | 49 | 15, 16, 17, 47, 48 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 |
| KW-US-024 | 作为固定工作用户，我希望在文件节点上按 Enter 固定打开并把焦点交给内容视图，以便可以从浏览状态进入稳定编辑状态。 | 49 | 15, 16, 17, 47, 48 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 |
| KW-US-025 | 作为文件夹导航用户，我希望在来源根或文件夹上按 Enter 只切换展开状态，以便不会生成没有内容语义的文件夹标签。 | 49 | 15, 16, 17, 47, 48 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 |
| KW-US-026 | 作为重命名用户，我希望用 F2 或右键在原树行内编辑单个资源的完整名称，以便可以快速改名且仍经过同源资源地址重构。 | 54 | 15, 16, 17, 47, 48, 49 | `tests/knowledge-refactor-rollback.test.ts`<br>`tests/knowledge-refactor-crash-recovery.test.ts` | E2E-KW-019 |
| KW-US-027 | 作为重命名 Markdown 文件的用户，我希望默认只选中最后扩展名前的基本名称，以便改标题时不容易误删 `.md` 扩展名。 | 54 | 15, 16, 17, 47, 48, 49 | `tests/knowledge-refactor-rollback.test.ts`<br>`tests/knowledge-refactor-crash-recovery.test.ts` | E2E-KW-019 |
| KW-US-028 | 作为使用多个编辑入口的用户，我希望让活动文档变化不自动展开、滚动或改选资源树，以便资源树选择不会因阅读链接或搜索结果而被破坏。 | 47 | 15, 16, 17, 48, 49 | `desktop/src/react/__tests__/components/resource-tree-selection.test.ts` | E2E-KW-015 |
| KW-US-029 | 作为需要定位文件的用户，我希望通过路径面包屑或“在资源树中显示”显式展开祖先并单选资源，以便可按需回到真实文件位置。 | 49 | 15, 16, 17, 47, 48 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 |
| KW-US-030 | 作为长期使用深层目录的用户，我希望当前 workspace 会话内保留已展开文件夹，以便连续导航；关闭或重新打开 workspace 后从折叠默认状态开始。 | 16 | 15, 17, 47, 48, 49 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.test.tsx` | 契约/集成 |
| KW-US-031 | 作为排序资源的用户，我希望按名称、最后修改时间或扩展名排序文件，并切换升降序，以便可按当前任务快速组织视图。 | 49 | 15, 16, 17, 47, 48 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 |
| KW-US-032 | 作为依赖稳定目录骨架的用户，我希望让文件夹在所有排序模式中始终优先并按自然名称升序，以便切换文件排序时目录位置不会跳动。 | 49 | 15, 16, 17, 47, 48 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 |
| KW-US-033 | 作为多来源用户，我希望排序模式只在当前 workspace 会话内生效，以便 V1 不建立跨打开的来源 UI 状态恢复。 | 49 | 15, 16, 17, 47, 48 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 |
| KW-US-034 | 作为重新打开 workspace 的用户，我希望不恢复资源树选择、范围锚点和键盘焦点，以便避免对已经变化的资源误执行操作。 | 49 | 15, 16, 17, 47, 48 | `desktop/src/react/__tests__/components/KnowledgeResourceTree.open.test.tsx` | E2E-KW-015 |
| KW-US-035 | 作为多文档用户，我希望在知识视图中打开多个资源标签，以便可以在同一工作空间中切换不同资料。 | 20 | 18, 22 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 |
| KW-US-036 | 作为快速浏览用户，我希望让每个编辑组最多有一个可替换的临时预览标签，以便连续单击文件时不会淹没标签栏。 | 20 | 18, 22 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 |
| KW-US-037 | 作为需要保留资源的用户，我希望通过双击、开始编辑、明确固定或拖动把预览标签转为固定标签，以便重要文档不会被下一次预览替换。 | 20 | 18, 22 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 |
| KW-US-038 | 作为多组编辑用户，我希望在所有编辑组中全局复用普通打开的既有标签，以便不会因当前组不同而隐式创建重复视图。 | 20 | 18, 22 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 |
| KW-US-039 | 作为并排比较用户，我希望通过“在侧边打开”、拖动标签或显式分屏创建同一资源的额外文档视图，以便可以明确表达并排查看意图。 | 20 | 18, 22 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 |
| KW-US-040 | 作为复杂工作流用户，我希望水平或垂直递归分割编辑组，以便可以构建适合当前任务的多面板布局。 | 20 | 18, 22 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 |
| KW-US-041 | 作为多视图 Markdown 用户，我希望让同一页面的所有视图共享源码、保存基线、未保存状态和撤销历史，以便任何视图的编辑都立即反映到其他视图。 | 18 | 20, 22 | `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts` | E2E-KW-004, E2E-KW-024 |
| KW-US-042 | 作为多视图 Markdown 用户，我希望让每个视图独立保存光标、选区、滚动、视口、显示模式和 Live Preview 语法显隐，以便并排阅读同一页面的不同位置时互不干扰。 | 18 | 20, 22 | `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts` | E2E-KW-004, E2E-KW-024 |
| KW-US-043 | 作为会话内切换标签的用户，我希望返回原视图时恢复该视图的操作位置，以便短暂切换文档不会丢失阅读上下文。 | 18 | 20, 22 | `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts` | E2E-KW-004, E2E-KW-024 |
| KW-US-044 | 作为新建或重开视图的用户，我希望让新视图统一从文档开头并默认实时预览，以便视图初始状态一致且可预测。 | 18 | 20, 22 | `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts` | E2E-KW-004, E2E-KW-024 |
| KW-US-045 | 作为关闭多视图文档的用户，我希望关闭非最后一个视图时不触发保存询问，以便共享文档仍有其他视图时可以快速整理布局。 | 22 | 18, 20 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 |
| KW-US-046 | 作为关闭最后视图的用户，我希望在存在未保存修改时选择保存、放弃或取消，以便不会静默丢失内容。 | 22 | 18, 20 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 |
| KW-US-047 | 作为 V1 用户，我希望每次打开工作目录都使用单个空编辑组，不恢复历史固定标签或布局，以便 workspace 生命周期简单且确定。 | 22 | 18, 20 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 |
| KW-US-048 | 作为快速浏览用户，我希望临时预览与固定标签都不跨 workspace 打开恢复，以便每次打开都是全新会话。 | 22 | 18, 20 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 |
| KW-US-049 | 作为布局用户，我希望当前会话中移除预览后自动删除空编辑组并收拢布局，但不持久化该布局。 | 20 | 18, 22 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 |
| KW-US-050 | 作为资源被外部移除的用户，我希望当前会话中已打开的干净标签显示资源失效状态，不猜测新位置或重新创建文件。 | 22 | 18, 20 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 |
| KW-US-051 | 作为外接盘或网络目录用户，我希望当前会话中干净页面保留来源不可用占位；有未保存修改的页面转为悬空未保存文档。 | 22 | 18, 20 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 |
| KW-US-052 | 作为来源恢复的用户，我希望只有干净页面按原地址重新加载；悬空未保存文档不得自动重新绑定。 | 22 | 18, 20 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 |
| KW-US-053 | 作为标签栏用户，我希望看到完整文件名作为标签名称，以便资源身份在页面与资产之间保持一致。 | 20 | 18, 22 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 |
| KW-US-054 | 作为编辑组用户，我希望在每组标签栏下看到来源名称、目录层级和完整文件名组成的路径面包屑，以便能持续理解当前文档位置而不暴露绝对路径。 | 20 | 18, 22 | `desktop/src/react/__tests__/components/KnowledgeEditorGroups.test.tsx`<br>`desktop/src/react/__tests__/components/KnowledgeTabBar.test.tsx` | E2E-KW-004 |
| KW-US-055 | 作为 Markdown 作者，我希望在实时预览与源码模式之间切换且共享同一文本缓冲区和撤销历史，以便无需在富文本副本和源码之间转换。 | 27 | 25, 26, 28, 29, 30, 31, 32 | `desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts` | E2E-KW-005 |
| KW-US-056 | 作为 Markdown 作者，我希望让实时预览仅在光标或选区触及相关元素时展开原始语法，以便阅读时保持清晰，编辑时仍可直接控制源码。 | 27 | 25, 26, 28, 29, 30, 31, 32 | `desktop/src/react/__tests__/editor/knowledge-live-preview.test.ts` | E2E-KW-005 |
| KW-US-057 | 作为大文档用户，我希望在 10 MiB 上限内编辑严格 UTF-8 Markdown，以便获得明确、跨平台一致的处理边界。 | 12 | 25, 26, 27, 28, 29, 30, 31, 32 | `desktop/src/react/__tests__/components/MarkdownEditorSurface.test.tsx` | 契约/集成 |
| KW-US-058 | 作为跨平台用户，我希望保存时保留文档单一既有换行风格并对混合换行执行确定性规范化，以便避免无意义的大范围 diff。 | 19 | 25, 26, 27, 28, 29, 30, 31, 32 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 |
| KW-US-059 | 作为列表作者，我希望按 Enter 延续列表、任务和引用结构，并在空结构上退出，以便常见 Markdown 输入符合预期。 | 28 | 25, 26, 27, 29, 30, 31, 32 | `desktop/src/react/__tests__/editor/knowledge-enter-commands.test.ts` | 契约/集成 |
| KW-US-060 | 作为列表作者，我希望让有序列表延续当前编号但不自动重排已有后续编号，以便编辑不会产生大范围意外改写。 | 28 | 25, 26, 27, 29, 30, 31, 32 | `desktop/src/react/__tests__/editor/knowledge-enter-commands.test.ts` | 契约/集成 |
| KW-US-061 | 作为键盘编辑用户，我希望用 Tab/Shift+Tab 缩进当前行或明确选择的完整行，以便可以高效调整列表与块级结构。 | 29 | 25, 26, 27, 28, 30, 31, 32 | `desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts` | 契约/集成 |
| KW-US-062 | 作为代码作者，我希望在围栏代码块中用 Tab 插入两个空格，以便缩进结果与 Markdown 源码保持确定。 | 29 | 25, 26, 27, 28, 30, 31, 32 | `desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts` | 契约/集成 |
| KW-US-063 | 作为 Markdown 作者，我希望在普通 Markdown 中用 Tab 插入两个空格，以便避免焦点意外离开编辑器。 | 29 | 25, 26, 27, 28, 30, 31, 32 | `desktop/src/react/__tests__/editor/knowledge-indent-commands.test.ts` | 契约/集成 |
| KW-US-064 | 作为写作用户，我希望使用粗体、斜体、标准 Markdown 链接和行内代码的基础快捷键，以便无需离开键盘即可应用常用格式。 | 30 | 25, 26, 27, 28, 29, 31, 32 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 |
| KW-US-065 | 作为写作用户，我希望通过斜杠命令复用基础格式和结构模板，以便可以发现并快速插入常用 Markdown。 | 30 | 25, 26, 27, 28, 29, 31, 32 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 |
| KW-US-066 | 作为斜杠命令用户，我希望在编辑器任意输入位置输入 `/` 触发命令块，以便不必先移动到空行或行首。 | 30 | 25, 26, 27, 28, 29, 31, 32 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 |
| KW-US-067 | 作为斜杠命令用户，我希望让查询从斜杠后立即开始并在第一个空白字符结束，以便触发和退出规则简单可预测。 | 30 | 25, 26, 27, 28, 29, 31, 32 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 |
| KW-US-068 | 作为斜杠命令用户，我希望按连续非空白查询做别名子串匹配，并优先前缀匹配，以便用少量输入即可定位命令。 | 30 | 25, 26, 27, 28, 29, 31, 32 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 |
| KW-US-069 | 作为斜杠命令用户，我希望看到单层固定命令列表及简短说明，以便不会被复杂菜单层级打断。 | 30 | 25, 26, 27, 28, 29, 31, 32 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 |
| KW-US-070 | 作为斜杠命令用户，我希望让块级命令在非行首时先建立新行，以便插入的 Markdown 结构保持有效。 | 30 | 25, 26, 27, 28, 29, 31, 32 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 |
| KW-US-071 | 作为链接作者，我希望通过斜杠命令插入 `[]()` 并把光标放在显示文字位置，以便可以立即填写标准 Markdown 链接。 | 30 | 25, 26, 27, 28, 29, 31, 32 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 |
| KW-US-072 | 作为 Markdown 作者，我希望让每个命令只插入最小固定模板并设置唯一初始光标，以便撤销和后续输入行为稳定。 | 30 | 25, 26, 27, 28, 29, 31, 32 | `desktop/src/react/__tests__/editor/knowledge-command-registry.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSlashMenu.test.tsx` | 契约/集成 |
| KW-US-073 | 作为表格作者，我希望使用 GFM 表格语法并按整块源码/预览切换，以便复杂表格结构不会被局部隐藏破坏。 | 31 | 25, 26, 27, 28, 29, 30, 32 | `desktop/src/react/__tests__/editor/knowledge-table-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts` | 契约/集成 |
| KW-US-074 | 作为表格作者，我希望用 GFM 标准冒号语法控制列对齐，以便文件可与其他 Markdown 工具兼容。 | 31 | 25, 26, 27, 28, 29, 30, 32 | `desktop/src/react/__tests__/editor/knowledge-table-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts` | 契约/集成 |
| KW-US-075 | 作为代码阅读者，我希望让普通围栏代码块按语言标识高亮但永不执行，以便可以安全阅读代码而不触发任意代码。 | 31 | 25, 26, 27, 28, 29, 30, 32 | `desktop/src/react/__tests__/editor/knowledge-table-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts` | 契约/集成 |
| KW-US-076 | 作为代码阅读者，我希望让普通代码块长行按可用宽度视觉软换行，以便无需水平滚动也不改变源码。 | 31 | 25, 26, 27, 28, 29, 30, 32 | `desktop/src/react/__tests__/editor/knowledge-table-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-code-block-field.test.ts` | 契约/集成 |
| KW-US-077 | 作为写作用户，我希望让普通 Markdown 正文按可用宽度视觉软换行，以便在窄编辑组中保持可读。 | 32 | 25, 26, 27, 28, 29, 30, 31 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 |
| KW-US-078 | 作为精确编辑用户，我希望让方向键、Home/End 和 Shift 选择始终按真实源码位置工作，以便视觉软换行不会改变编辑语义。 | 32 | 25, 26, 27, 28, 29, 30, 31 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 |
| KW-US-079 | 作为精确编辑用户，我希望不常驻显示源码行号，以便实时预览保持简洁。 | 32 | 25, 26, 27, 28, 29, 30, 31 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 |
| KW-US-080 | 作为状态感知用户，我希望在全局底部状态栏看到活动 Markdown 视图的行、列和总字符数，以便能够了解当前位置与文档规模。 | 32 | 25, 26, 27, 28, 29, 30, 31 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 |
| KW-US-081 | 作为多组用户，我希望让状态栏跟随活动编辑组，并在侧栏聚焦时保留最后活动 Markdown 状态，以便上下文不会因短暂操作资源树而消失。 | 32 | 25, 26, 27, 28, 29, 30, 31 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 |
| KW-US-082 | 作为非 Markdown 资源用户，我希望在资产视图中保留空的单行全局状态栏，以便界面布局不会因资源类型切换而跳动。 | 32 | 25, 26, 27, 28, 29, 30, 31 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 |
| KW-US-083 | 作为窄窗口用户，我希望在空间不足时整组隐藏行列和字符数，以便状态栏不会换行或挤压主要内容。 | 32 | 25, 26, 27, 28, 29, 30, 31 | `desktop/src/react/__tests__/components/KnowledgeEditorStatusBar.test.tsx` | 契约/集成 |
| KW-US-084 | 作为图表作者，我希望使用 SilverBullet 兼容的 Mermaid 围栏语法，以便能在标准 Markdown 中保存图表源码。 | 33 | 34, 35 | `desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-math-field.test.ts` | E2E-KW-011 |
| KW-US-085 | 作为图表作者，我希望在光标离开 Mermaid 围栏后才刷新预览，并在失败时看到内联错误，以便输入过程稳定且错误不阻断编辑。 | 33 | 34, 35 | `desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-math-field.test.ts` | E2E-KW-011 |
| KW-US-086 | 作为数学作者，我希望使用已确认的行内与块级数学语法，以便能在同一 Markdown 页面中表达公式。 | 33 | 34, 35 | `desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-math-field.test.ts` | E2E-KW-011 |
| KW-US-087 | 作为数学作者，我希望在光标离开数学元素后刷新渲染，并在失败时看到内联错误，以便输入中间状态不会频繁闪烁。 | 33 | 34, 35 | `desktop/src/react/__tests__/editor/knowledge-mermaid-field.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-math-field.test.ts` | E2E-KW-011 |
| KW-US-088 | 作为学术写作者，我希望使用参考式脚注、兼容多行定义并在标记上悬停预览，以便可以阅读脚注而不离开正文。 | 34 | 33, 35 | `desktop/src/react/__tests__/editor/knowledge-footnote-field.test.ts` | E2E-KW-011 |
| KW-US-089 | 作为脚注作者，我希望让重复脚注定义由文档中第一个定义生效并按大小写精确匹配，以便解析结果稳定且可预测。 | 34 | 33, 35 | `desktop/src/react/__tests__/editor/knowledge-footnote-field.test.ts` | E2E-KW-011 |
| KW-US-090 | 作为脚注作者，我希望在输入 `[^` 后补全当前页面已定义标签，以便可以减少标签拼写错误。 | 34 | 33, 35 | `desktop/src/react/__tests__/editor/knowledge-footnote-field.test.ts` | E2E-KW-011 |
| KW-US-091 | 作为导入现有 Markdown 的用户，我希望对原始 HTML 严格净化后静态渲染，以便保留兼容内容同时避免脚本和危险样式。 | 35 | 33, 34 | `tests/knowledge-safe-links.test.ts`<br>`desktop/src/react/__tests__/utils/knowledge-safe-rendering.test.ts` | E2E-KW-011 |
| KW-US-092 | 作为原始 HTML 用户，我希望在安全 HTML 容器内继续解析已支持 Markdown，以便现有混合内容能保持合理显示。 | 35 | 33, 34 | `tests/knowledge-safe-links.test.ts`<br>`desktop/src/react/__tests__/utils/knowledge-safe-rendering.test.ts` | E2E-KW-011 |
| KW-US-093 | 作为安全敏感用户，我希望禁止原始 HTML 自定义 CSS，且只允许嵌入当前 Markdown 页面所属来源内的本地资产，以便内容不能突破宿主样式和资源边界。 | 35 | 33, 34 | `tests/knowledge-safe-links.test.ts`<br>`desktop/src/react/__tests__/utils/knowledge-safe-rendering.test.ts` | E2E-KW-011 |
| KW-US-094 | 作为外链用户，我希望只在明确单击 HTTP/HTTPS 链接后交给系统浏览器，以便页面加载不会自动发起外部导航。 | 35 | 33, 34 | `tests/knowledge-safe-links.test.ts`<br>`desktop/src/react/__tests__/utils/knowledge-safe-rendering.test.ts` | E2E-KW-011 |
| KW-US-095 | 作为查找用户，我希望用 Ctrl/Cmd+F 在当前 Markdown 源码中查找真实文本，以便Live Preview 隐藏的语法仍可被准确定位。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-096 | 作为替换用户，我希望用 Ctrl/Cmd+H 展开替换区域并保留当前查找状态，以便可以从查找平滑进入替换。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-097 | 作为查找用户，我希望默认不区分大小写并可明确切换全词匹配，以便常规查找简单且可精细控制。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-098 | 作为查找用户，我希望不使用正则表达式模式，以便避免复杂模式与错误状态干扰基础功能。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-099 | 作为查找用户，我希望让上一项和下一项首尾循环并显示当前序号与总数，以便可以连续浏览全部匹配。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-100 | 作为查找用户，我希望打开面板时用当前单行选区初始化查询，否则从光标位置向后激活首个匹配，以便查找从当前上下文开始。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-101 | 作为替换用户，我希望单次替换后自动激活下一个匹配，以便可以连续处理多个位置。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-102 | 作为替换用户，我希望让全部替换基于执行前匹配集合一次完成并成为单一撤销步骤，以便结果稳定且可整体撤销。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-103 | 作为查找用户，我希望在右上角固定弹窗中工作且不改变编辑器布局，以便面板不会导致正文重排。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-104 | 作为多组用户，我希望同一时间只在一个编辑组显示查找弹窗，并在切换组时关闭旧弹窗，以便查找上下文不会跨组混淆。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-105 | 作为同组多标签用户，我希望切换 Markdown 标签时沿用弹窗查询并从新文档自身光标开始，以便可以用同一查询快速检查多个页面。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-106 | 作为资产用户，我希望切换到非 Markdown 标签时关闭 Markdown 查找弹窗并使用查看器自身查找，以便不同资源类型遵循各自能力。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-107 | 作为查找用户，我希望同时高亮全部匹配并突出当前匹配，以便能够理解匹配分布。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-108 | 作为编辑中的查找用户，我希望源码变化后实时重算匹配，并让当前匹配避开面板遮挡，以便查找状态与当前内容保持一致。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-109 | 作为键盘用户，我希望用 Esc 或关闭按钮统一关闭面板并把焦点还给编辑器，以便操作语义一致。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-110 | 作为键盘用户，我希望在查找面板可见控件间形成封闭、固定顺序的焦点循环，以便无需鼠标也能完成查找替换。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-111 | 作为查找用户，我希望空查询、无匹配或唯一匹配时让命令自然空操作或停留，以便界面不因边界状态突然禁用或报错。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-112 | 作为隐私用户，我希望不保存查找与替换历史或自动建议，以便敏感查询不会进入持久记录。 | 36 | — | `desktop/src/react/__tests__/components/KnowledgeFindBar.test.tsx` | E2E-KW-012 |
| KW-US-113 | 作为作者，我希望 `[[` 和 `![[` 只补全当前页面所属来源内的资源。 | 37 | 23, 24, 38, 39 | `desktop/src/react/__tests__/editor/knowledge-link-completion.test.ts`<br>`desktop/src/react/__tests__/commands/knowledge-link-navigation.test.ts` | E2E-KW-009 |
| KW-US-114 | 作为作者，我希望同来源 Page 或 Asset 直接插入来源内 Wikilink，并保留真实扩展名。 | 24 | 23, 37, 38, 39 | `desktop/src/react/__tests__/editor/knowledge-link-field.test.ts` | E2E-KW-009 |
| KW-US-115 | 作为跨来源用户，我希望从其他来源拖入 Page 时先把整个 `.md` 文件复制到当前页面目录，再链接副本。 | 38 | 23, 24, 37, 39 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 |
| KW-US-116 | 作为附件用户，我希望从其他来源或系统拖入媒体时先复制到当前页面同级 `assets/`，成功后再插入嵌入式 Wikilink。 | 38 | 23, 24, 37, 39 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 |
| KW-US-117 | 作为数据安全用户，我希望复制失败时不插入无效链接，也不留下半成品。 | 38 | 23, 24, 37, 39 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 |
| KW-US-118 | 作为可预测性用户，我希望复制后的 Markdown 正文保持原样，不执行链接清理或跨来源引用重写。 | 38 | 23, 24, 37, 39 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-attachment-policy.test.ts` | E2E-KW-010 |
| KW-US-119 | 作为导航用户，我希望 Wikilink、内容引用、嵌入、出站引用和反向引用只在当前来源内解析。 | 23 | 24, 37, 38, 39 | `tests/knowledge-link-resolver.test.ts` | E2E-KW-009 |
| KW-US-120 | 作为页面复用用户，我希望整页和章节嵌入只允许同一来源；另一来源 Page 必须先复制。 | 39 | 23, 24, 37, 38 | `desktop/src/react/__tests__/editor/knowledge-embed-field.test.ts` | E2E-KW-009 |
| KW-US-121 | 作为断裂链接用户，我希望系统不搜索其他来源猜测目标，只有当前来源内缺失 Page 可以使用延迟创建。 | 37 | 23, 24, 38, 39 | `desktop/src/react/__tests__/editor/knowledge-link-completion.test.ts`<br>`desktop/src/react/__tests__/commands/knowledge-link-navigation.test.ts` | E2E-KW-009 |
| KW-US-122 | 作为外链用户，我希望 HTTP/HTTPS 仍按明确单击交给系统浏览器，且不与来源内知识链接混淆。 | 35 | 23, 24, 37, 38, 39 | `tests/knowledge-safe-links.test.ts`<br>`desktop/src/react/__tests__/utils/knowledge-safe-rendering.test.ts` | E2E-KW-011 |
| KW-US-123 | 作为 Markdown 作者，我希望只在明确按 Ctrl/Cmd+S 或执行保存命令时保存当前活动文档，以便掌握内容何时写入磁盘。 | 19 | 21, 22 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 |
| KW-US-124 | 作为 Markdown 作者，我希望不因停止输入、切换标签、切换模式或时间经过而自动保存，以便避免未确认修改被静默落盘。 | 19 | 21, 22 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 |
| KW-US-125 | 作为多文档用户，我希望不提供“保存全部”命令，以便每个文档的保存意图与冲突处理保持明确。 | 19 | 21, 22 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 |
| KW-US-126 | 作为多视图用户，我希望从任一视图保存共享文档并更新所有视图的保存基线，以便不会出现同一页面不同保存状态。 | 19 | 21, 22 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 |
| KW-US-127 | 作为并发编辑用户，我希望保存时使用最近成功版本作为 expected version，以便外部变化不会被静默覆盖。 | 19 | 21, 22 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 |
| KW-US-128 | 作为保存成功的用户，我希望保存成功时保持静默且不清空撤销历史，以便写作流程不中断且仍可撤销。 | 19 | 21, 22 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 |
| KW-US-129 | 作为保存失败的用户，我希望保留当前源码并让所有视图继续显示未保存状态，以便失败不会丢失内存中的修改。 | 19 | 21, 22 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 |
| KW-US-130 | 作为保存失败的用户，我希望看到不抢焦点、持续显示且可手动关闭的非模态通知，以便可以继续编辑并稍后处理错误。 | 19 | 21, 22 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 |
| KW-US-131 | 作为重复保存失败的用户，我希望让同一文档复用并更新一条失败通知，以便不会被重复错误消息淹没。 | 19 | 21, 22 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 |
| KW-US-132 | 作为保存恢复的用户，我希望在后续保存成功后自动移除该文档的失败通知，以便界面反映问题已经解决。 | 19 | 21, 22 | `desktop/src/react/__tests__/components/KnowledgeDocumentEditor.save.test.tsx` | E2E-KW-005 |
| KW-US-133 | 作为外部工具用户，我希望在本地缓冲区干净时自动重新加载外部磁盘变化，以便看到 Finder、Git、脚本或其他编辑器的最新内容。 | 21 | 19, 22 | `desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx` | E2E-KW-007 |
| KW-US-134 | 作为并发编辑用户，我希望在本地有未保存修改且磁盘变化时进入三方冲突解决，以便可以比较基线、本地与磁盘版本后明确选择。 | 21 | 19, 22 | `desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx` | E2E-KW-007 |
| KW-US-135 | 作为冲突处理用户，我希望选择合并、使用本地版本或使用磁盘版本，以便不会被静默覆盖、重载或自动合并。 | 21 | 19, 22 | `desktop/src/react/__tests__/components/KnowledgeConflictResolver.test.tsx` | E2E-KW-007 |
| KW-US-136 | 作为来源不可写或已丢失的用户，我希望原位置保存明确失败，并将当前缓冲区按新建页面流程保存到当前 workspace 中另一个仍可用且可写来源内由我选择的新路径。 | 22 | 19, 21 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 |
| KW-US-137 | 作为悬空文档用户，我希望新建页面保存成功后把当前标签、会话和面包屑绑定到新知识地址，以便后续保存作用于新页面。 | 22 | 19, 21 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 |
| KW-US-138 | 作为悬空文档用户，我希望保存到新位置时不改写任何指向旧地址的引用，以便新建页面不会被误当作身份迁移。 | 22 | 19, 21 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 |
| KW-US-139 | 作为悬空文档用户，我希望保存目标冲突遵循新建页面的既有命名与保存交互，而不是迁移或引用重构协议。 | 22 | 19, 21 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 |
| KW-US-140 | 作为关闭最后视图的用户，我希望在未保存时选择保存、放弃或取消，以便关闭动作不会静默丢失内容。 | 22 | 19, 21 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 |
| KW-US-141 | 作为退出应用的用户，我希望按文档逐个执行保存、放弃或取消流程，以便可以逐项确认未保存文档。 | 22 | 19, 21 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 |
| KW-US-142 | 作为退出应用的用户，我希望在任一取消或保存失败时立即终止整体关闭且不回滚已完成结果，以便失败状态清晰且不会产生反向副作用。 | 22 | 19, 21 | `tests/knowledge-workspace-lifecycle.test.ts`<br>`desktop/src/react/__tests__/components/UnsavedDocumentsDialog.test.tsx` | E2E-KW-008 |
| KW-US-143 | 作为风险敏感用户，我希望只在同源资源地址重构、Agent 修改、冲突覆盖、恢复和删除前建立本地操作检查点，以便高风险操作可恢复而普通未保存输入不会产生隐式副本。 | 10 | 19, 21, 22 | `tests/knowledge-operation-tracer.test.ts`<br>`tests/knowledge-operation-journal.test.ts`<br>`tests/knowledge-operation-recovery.test.ts` | 契约/集成 |
| KW-US-144 | 作为删除资源的用户，我希望每次删除前看到明确确认，以便避免误删真实磁盘资源。 | 55 | 56 | `tests/knowledge-trash-delete.test.ts`<br>`tests/knowledge-trash-crash-recovery.test.ts` | E2E-KW-020 |
| KW-US-145 | 作为删除打开页面的用户，我希望在删除前逐个解决受影响的未保存 Markdown 文档，以便不会在文件操作中丢失缓冲区内容。 | 55 | 56 | `tests/knowledge-trash-delete.test.ts`<br>`tests/knowledge-trash-crash-recovery.test.ts` | E2E-KW-020 |
| KW-US-146 | 作为删除资源的用户，我希望把资源移入其所属来源根级工作区回收站，以便删除可恢复且来源身份不混淆。 | 55 | 56 | `tests/knowledge-trash-delete.test.ts`<br>`tests/knowledge-trash-crash-recovery.test.ts` | E2E-KW-020 |
| KW-US-147 | 作为知识用户，我希望让工作区回收站内容不出现在正常资源树、搜索、标签、任务或引用解析中，以便已删除资源不会继续充当有效知识。 | 55 | 56 | `tests/knowledge-trash-delete.test.ts`<br>`tests/knowledge-trash-crash-recovery.test.ts` | E2E-KW-020 |
| KW-US-148 | 作为批量删除用户，我希望让每个顶层资源原子删除且批次允许部分完成，以便局部失败不会造成半个资源树。 | 55 | 56 | `tests/knowledge-trash-delete.test.ts`<br>`tests/knowledge-trash-crash-recovery.test.ts` | E2E-KW-020 |
| KW-US-149 | 作为恢复用户，我希望把资源恢复到原位置并安全重建缺失父目录，以便可以回到删除前结构。 | 56 | 55 | `tests/knowledge-trash-restore.test.ts`<br>`tests/knowledge-native-trash.test.ts` | E2E-KW-020 |
| KW-US-150 | 作为恢复冲突用户，我希望让文件或整个目录使用确定性的 `_2`、`_3` 名称避让，以便恢复优先保全内容而不覆盖现有资源。 | 56 | 55 | `tests/knowledge-trash-restore.test.ts`<br>`tests/knowledge-native-trash.test.ts` | E2E-KW-020 |
| KW-US-151 | 作为批次恢复用户，我希望只调整同一删除批次内双方都恢复的可确定引用，以便不会擅自重写工作区其他文件。 | 56 | 55 | `tests/knowledge-trash-restore.test.ts`<br>`tests/knowledge-native-trash.test.ts` | E2E-KW-020 |
| KW-US-152 | 作为回收站用户，我希望看到来源、原路径、删除时间和批次信息，以便能判断应恢复哪一项。 | 56 | 55 | `tests/knowledge-trash-restore.test.ts`<br>`tests/knowledge-native-trash.test.ts` | E2E-KW-020 |
| KW-US-153 | 作为回收站清理用户，我希望让到期或手动清理只移入操作系统废纸篓，以便应用不提供绕过系统废纸篓的永久删除。 | 56 | 55 | `tests/knowledge-trash-restore.test.ts`<br>`tests/knowledge-native-trash.test.ts` | E2E-KW-020 |
| KW-US-154 | 作为回收站用户，我希望默认保留删除内容 30 天，以便有合理恢复窗口。 | 56 | 55 | `tests/knowledge-trash-restore.test.ts`<br>`tests/knowledge-native-trash.test.ts` | E2E-KW-020 |
| KW-US-155 | 作为恢复失败用户，我希望获得资源级结果与可重试错误，以便批量恢复中的成功项和失败项都可解释。 | 56 | 55 | `tests/knowledge-trash-restore.test.ts`<br>`tests/knowledge-native-trash.test.ts` | E2E-KW-020 |
| KW-US-156 | 作为资产用户，我希望在应用内只读预览非 Markdown 文本、图片、PDF、音视频或文件信息，以便可以查看资料而不把 V1 扩张为通用编辑器。 | 17 | 09, 13, 14, 40, 41, 42, 43, 44, 45, 46 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 |
| KW-US-157 | 作为文本资产用户，我希望只在严格 UTF-8 或带明确 BOM 的 UTF-8/16/32 编码下预览和索引，以便跨平台不会因猜测代码页产生乱码。 | 42 | 09, 13, 14, 17, 40, 41, 43, 44, 45, 46 | `tests/safe-text-index-extractor.test.ts` | E2E-KW-013 |
| KW-US-158 | 作为传统编码文件用户，我希望在无法安全解码时仍能管理资源并用系统默认应用打开，以便格式限制不会阻断文件管理。 | 17 | 09, 13, 14, 40, 41, 42, 43, 44, 45, 46 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 |
| KW-US-159 | 作为大文本资产用户，我希望在超过 10 MiB 时只显示文件信息并保留资源身份搜索，以便应用不会因大文件预览或索引耗尽资源。 | 17 | 09, 13, 14, 40, 41, 42, 43, 44, 45, 46 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 |
| KW-US-160 | 作为 PDF 用户，我希望使用内置只读预览但不获得正文搜索、OCR、页内高亮或内容命中，以便 V1 能力边界明确。 | 17 | 09, 13, 14, 40, 41, 42, 43, 44, 45, 46 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 |
| KW-US-161 | 作为资产预览用户，我希望在外部文件变化时自动刷新并尽量保留滚动、页码、缩放或播放位置，以便外部工具修改后立即看到最新事实。 | 17 | 09, 13, 14, 40, 41, 42, 43, 44, 45, 46 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 |
| KW-US-162 | 作为资产被外部删除的用户，我希望让标签保留并显示资源不存在，而不创建空文件或猜测新位置，以便外部删除意图得到尊重。 | 17 | 09, 13, 14, 40, 41, 42, 43, 44, 45, 46 | `desktop/src/react/__tests__/components/KnowledgeAssetViewer.test.tsx`<br>`tests/resource-open-policy.test.ts` | E2E-KW-006, E2E-KW-017 |
| KW-US-163 | 作为受限访问用户，我希望在未认证、无 owner、越出来源或路径校验失败时拒绝资源操作，以便其他会话、来源和本地路径不会被越权访问。 | 03 | 09, 13, 14, 17, 40, 41, 42, 43, 44, 45, 46 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 |
| KW-US-164 | 作为独立 Server 用户，我希望让所有知识能力在没有 Electron 内存的 Node Server 中成立，以便LAN、CLI 和非桌面入口不会依赖主进程状态。 | 03 | 09, 13, 14, 17, 40, 41, 42, 43, 44, 45, 46 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 |
| KW-US-165 | 作为Desktop 用户，我希望只在系统文件选择器、系统剪贴板、系统废纸篓或默认应用等必要场景使用 Electron 原生能力，以便普通业务仍可复用 Server API。 | 51 | 09, 13, 14, 17, 40, 41, 42, 43, 44, 45, 46 | `tests/knowledge-native-contract.test.ts`<br>`tests/knowledge-import.test.ts`<br>`desktop/src/react/__tests__/services/knowledge-native-client.test.ts` | E2E-KW-017 |
| KW-US-166 | 作为桌面用户，我希望文档会话、资源事件和 UI 状态在现有生命周期出现多个 Renderer context 时保持 owner/window 隔离，以便不会产生隐藏单例冲突；V1 不因此新增独立浮动知识窗口入口。 | 18 | 09, 13, 14, 17, 40, 41, 42, 43, 44, 45, 46 | `desktop/src/react/__tests__/stores/knowledge-document-registry.test.ts` | E2E-KW-004, E2E-KW-024 |
| KW-US-167 | 作为国际化用户，我希望在中文、英文、日文、韩文和繁体中文中看到完整新增文案，以便不同语言入口获得一致功能。 | 15 | 09, 13, 14, 17, 40, 41, 42, 43, 44, 45, 46 | `desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx`<br>`tests/knowledge-i18n-a11y-contract.test.ts` | E2E-KW-001, E2E-KW-023 |
| KW-US-168 | 作为键盘与辅助技术用户，我希望使用完整键盘路径、可见焦点、语义标签和合理焦点恢复，以便无需鼠标也能操作资源树、编辑器和对话框。 | 15 | 09, 13, 14, 17, 40, 41, 42, 43, 44, 45, 46 | `desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx`<br>`tests/knowledge-i18n-a11y-contract.test.ts` | E2E-KW-001, E2E-KW-023 |
| KW-US-169 | 作为亮色与暗色主题用户，我希望在不同窗口 surface 和主题下获得清晰对比度，以便界面状态与错误提示始终可读。 | 15 | 09, 13, 14, 17, 40, 41, 42, 43, 44, 45, 46 | `desktop/src/react/__tests__/components/KnowledgeWorkspace.test.tsx`<br>`tests/knowledge-i18n-a11y-contract.test.ts` | E2E-KW-001, E2E-KW-023 |
| KW-US-170 | 作为用户数据保护者，我希望让日志不记录 token、绝对路径和用户敏感内容，以便诊断信息不会扩大隐私风险。 | 04 | 09, 13, 14, 17, 40, 41, 42, 43, 44, 45, 46 | `tests/knowledge-diagnostics.test.ts` | 契约/集成 |
| KW-US-171 | 作为跨平台用户，我希望在 Windows、macOS 和 Linux 上得到一致的路径、大小写、符号链接、废纸篓和快捷键结果，以便同一工作区行为可预测。 | 14 | 09, 13, 17, 40, 41, 42, 43, 44, 45, 46 | `tests/knowledge-malicious-workspace.test.ts`<br>`tests/knowledge-threat-control-matrix.test.ts` | E2E-KW-022 |
| KW-US-172 | 作为开放版用户，我希望在 open composition 中只使用开放实现与稳定协议，以便开放构建不会动态绕过边界。 | 03 | 09, 13, 14, 17, 40, 41, 42, 43, 44, 45, 46 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 |
| KW-US-173 | 作为完整产品用户，我希望通过 composition root 注入完整产品差异而不改变共享契约，以便open/full 版本保持兼容。 | 03 | 09, 13, 14, 17, 40, 41, 42, 43, 44, 45, 46 | `tests/knowledge-contract-schema.test.ts`<br>`tests/knowledge-open-full-composition.test.ts` | E2E-KW-002, E2E-KW-021 |
| KW-US-174 | 作为使用页面属性的作者，我希望安全编辑唯一顶层键且值为 JSON 标量或一维 JSON 标量数组的 Frontmatter 字段，并保持未知字段、注释、顺序、换行和复杂 YAML 原文；无法无损投影时回到源码模式。 | 25 | 11, 12, 19, 41 | `tests/frontmatter-roundtrip.test.ts` | 契约/集成 |
| KW-US-175 | 作为标签用户，我希望页面正文与 Frontmatter 标签按来源解析并在同一页面状态中展示，以便标签不会跨来源合并。 | 26 | 11, 25, 41, 44 | `tests/knowledge-tags-tasks.test.ts` | E2E-KW-013 |
| KW-US-176 | 作为任务用户，我希望查看并切换当前页面的标准 Markdown task，且每次切换只修改同一文档缓冲区并可单步撤销。 | 26 | 11, 12, 19, 41 | `tests/knowledge-tags-tasks.test.ts` | 契约/集成 |
| KW-US-177 | 作为标准 Markdown 用户，我希望内部文件链接按包含页面目录解析并被证明仍在同一来源，以便标准链接与 Wikilink 具有一致的安全边界。 | 24 | 11, 23, 37, 54 | `tests/knowledge-link-resolver.test.ts`<br>`desktop/src/react/__tests__/editor/knowledge-link-field.test.ts` | E2E-KW-009 |
| KW-US-178 | 作为作者，我希望在明确的来源和目录中新建 `.md` Page，名称冲突时不静默覆盖。 | 50 | 10, 47, 49 | `tests/knowledge-create-service.test.ts`<br>`desktop/src/react/__tests__/components/CreateResourceDialog.test.tsx` | E2E-KW-016 |
| KW-US-179 | 作为文件管理用户，我希望在明确的来源和目录中新建文件夹，非法名称、越界或冲突返回可修正错误。 | 50 | 10, 47, 49 | `tests/knowledge-create-service.test.ts`<br>`desktop/src/react/__tests__/components/CreateResourceDialog.test.tsx` | E2E-KW-016 |
| KW-US-180 | 作为 Desktop 用户，我希望通过系统文件/目录选择器把外部资源导入明确目标，而 Renderer 永远不接收本机绝对路径。 | 51 | 03, 06, 10, 14, 50 | `tests/knowledge-native-contract.test.ts`<br>`tests/knowledge-import.test.ts` | E2E-KW-017 |
| KW-US-181 | 作为批量导入用户，我希望对文件冲突选择跳过、保留两者或替换，对目录确定性合并，并获得资源级成功/失败及仅重试失败项。 | 51 | 06, 10, 14, 50 | `tests/knowledge-import.test.ts` | E2E-KW-017 |
| KW-US-182 | 作为资源树用户，我希望在当前会话内复制并粘贴文件或目录，冲突时使用确定性后缀且保持每个副本字节原样。 | 52 | 06, 10, 38, 47 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/stores/knowledge-clipboard-slice.test.ts` | E2E-KW-018 |
| KW-US-183 | 作为剪切用户，我希望只在同一来源内粘贴为移动；跨来源剪切明确拒绝或经我确认转为复制，绝不隐式删除原资源。 | 52 | 06, 10, 38, 47 | `tests/knowledge-copy-service.test.ts`<br>`desktop/src/react/__tests__/stores/knowledge-clipboard-slice.test.ts` | E2E-KW-018 |
| KW-US-184 | 作为拖拽用户，我希望同来源拖拽表达移动、跨来源拖拽表达复制，并在提交前看到目标与动作。 | 53 | 06, 10, 38, 47, 48 | `tests/knowledge-drag-contract.test.ts`<br>`desktop/src/react/__tests__/components/knowledge-drag-controller.test.ts` | E2E-KW-018 |
| KW-US-185 | 作为大型树用户，我希望拖拽拥有有效目标提示、800ms 悬停展开、边缘自动滚动、取消和完成后确定的选择/焦点。 | 53 | 47, 48, 49 | `desktop/src/react/__tests__/components/knowledge-drag-controller.test.ts` | E2E-KW-018 |
| KW-US-186 | 作为重构用户，我希望同来源 rename/move 对主资源和全部已计划已保存链接形成可回滚事务，post-commit session/index 投影失败不会撤销已提交文件。 | 54 | 10, 11, 23, 43 | `tests/knowledge-refactor-rollback.test.ts`<br>`tests/knowledge-refactor-crash-recovery.test.ts` | E2E-KW-019 |
| KW-US-187 | 作为知识检索用户，我希望每个来源索引只从已保存磁盘资源构建并可独立丢弃重建，以便缓存不成为第二事实源。 | 40 | 41, 42, 43 | `tests/knowledge-index-store.test.ts`<br>`tests/knowledge-index-schema-migration.test.ts` | E2E-KW-013, E2E-KW-014 |
| KW-US-188 | 作为搜索用户，我希望从一个入口搜索全部当前来源，并按 `main`、挂载顺序分组且每来源独立分页。 | 45 | 40, 41, 42, 43, 44 | `tests/knowledge-search-query.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeSearch.test.tsx` | E2E-KW-013 |
| KW-US-189 | 作为 Unicode 内容用户，我希望关键词、连续短语与独立 `OR` 按 NFC+大小写折叠后的连续子串匹配，短查询也不因加速器限制而漏结果。 | 45 | 40, 44 | `tests/knowledge-search-query.test.ts` | E2E-KW-013 |
| KW-US-190 | 作为标签导航用户，我希望点击标签只在当前来源发起预填搜索，并清晰显示不可编辑的来源上下文。 | 45 | 26, 44 | `desktop/src/react/__tests__/components/KnowledgeSearch.test.tsx` | E2E-KW-013 |
| KW-US-191 | 作为正在编辑的用户，我希望当前大纲和出站引用实时读取未保存 buffer，以便导航反映眼前内容。 | 46 | 11, 23, 44 | `desktop/src/react/__tests__/components/KnowledgeCurrentResourceViews.test.tsx` | E2E-KW-013 |
| KW-US-192 | 作为引用追踪用户，我希望反向引用只读取当前来源已保存索引，以便未保存或其他来源内容不会产生虚假边。 | 46 | 23, 40, 41, 44 | `tests/knowledge-query-api.test.ts`<br>`desktop/src/react/__tests__/components/KnowledgeCurrentResourceViews.test.tsx` | E2E-KW-013 |
| KW-US-193 | 作为索引故障用户，我希望看到 building/stale/degraded/corrupt/locked/unavailable 状态并可按来源重建，同时在可用时继续读取旧 generation。 | 43 | 40, 44, 45 | `tests/knowledge-index-rebuild.test.ts`<br>`tests/knowledge-index-event-coordinator.test.ts` | E2E-KW-014 |

## 冻结规则域

| Rule ID | 内容 | Primary/implementing tickets | 自动化与权威契约 |
|---|---|---|---|
| KW-RULE-LICENSE | 第三方来源、哈希、许可与 notice | 02 | `silverbullet-reference-matrix.md` |
| KW-RULE-RESOURCE | ResourceIO、来源、地址与兼容入口 | 03, 05, 06, 07, 08, 09 | `implementation-contracts.md` |
| KW-RULE-OBS | 错误、诊断与 correlation | 04, 10, 43 | `architecture.md / threat-model.md` |
| KW-RULE-OP | plan/commit/checkpoint/batch result | 10, 50, 51, 52, 53, 54, 55, 56 | `operation-journal-contract.md` |
| KW-RULE-MARKDOWN | 共享 IR、编辑器与 Markdown 语义 | 11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39 | `spec.md / architecture.md` |
| KW-RULE-PERF | 数据集、统计与性能预算 | 13 | `performance-budget.md` |
| KW-RULE-SEC | 恶意 workspace、路径与渲染安全 | 14, 17, 35, 51, 54, 55, 56 | `threat-model.md` |
| KW-RULE-INDEX | SQLite 分区、抽取、增量与 rebuild | 40, 41, 42, 43 | `index-store-contract.md` |
| KW-RULE-QUERY | 标签、引用与页面查询 API | 44, 46 | `architecture.md` |
| KW-RULE-SEARCH | 查询词法、分组与排序 | 45 | `spec.md / performance-budget.md` |
| KW-RULE-VIEW | 当前大纲与引用视图 | 46 | `spec.md` |
| KW-RULE-COPY | 附件与跨来源复制后引用 | 38 | `operation-journal-contract.md` |
| KW-RULE-CREATE | 页面与文件夹创建 | 50 | `operation-journal-contract.md` |
| KW-RULE-IMPORT | 外部导入与冲突策略 | 51 | `implementation-contracts.md` |
| KW-RULE-CLIPBOARD | 会话内复制、剪切与粘贴 | 52 | `operation-journal-contract.md` |
| KW-RULE-DND | 资源拖拽协议 | 53 | `operation-journal-contract.md` |
| KW-RULE-REFACTOR | 同源 rename/move 事务 | 54 | `operation-journal-contract.md` |
| KW-RULE-RELEASE | 集成与发布证据 | 57 | `release-checklist.md / release-evidence.md` |
| KW-RULE-PREFLIGHT | 真实仓库实现前检查 | 01 | `implementation-baseline.md` |
| KW-RULE-NATIVE | 最小 Electron native bridge 与 grant | 17, 51, 56 | `implementation-contracts.md` |
| KW-RULE-RECOVERY | 持久 journal、幂等与崩溃恢复 | 10, 43, 54, 55, 56 | `operation-journal-contract.md` |
| KW-RULE-TEST | 精确 ownership、E2E 与平台证据 | 01, 13, 14, 57 | `test-strategy.md` / `requirements-traceability.md` |
