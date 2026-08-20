## 落点裁决：Knowledge 工作区资源内核与文件树交互收敛

**功能本质**：消费既有 Workbench、ResourceIO、ResourceEventBus、Native Grant 和文件预览能力，修正活动工作根与共享资源 owner 的绑定并补齐 Knowledge 资源树交互；新增的是系统级 workspace/resource 生命周期与跨组件 UI 适配，产物归 HanaKDE 系统共享状态和用户真实文件事实。

**落点**：HanaKDE 系统本体

**关键判据**
- 支持系统本体：破盒硬门 1 命中。必须修改 Knowledge workspace、ResourceIO owner、operation coordinator、watcher/index binding 与切换生命周期；插件只能消费这些契约，不能修正其内部状态。
- 支持系统本体：破盒硬门 2 命中。单一活动工作根/ResourceIO owner 是 Knowledge、Workbench、ResourceIO、索引和事件消费者共同依赖的共享契约原语。
- 支持系统本体：软门 4、5、7 均破盒。删除该能力会使 Knowledge 核心 mutation、真实文件事实和桌面资源树不完整；需要修改 Server/Engine/Renderer 接缝，产物是系统级共享状态而不是插件私有数据。
- 反对系统本体（最强反方）：资源树右键菜单、文件 icon 和 open preview 的局部 UI 适配本身可以放进插件贡献面；但它不能独立解决 503，也不能定义 `main`/ResourceIO owner，因此不足以翻盘。

**边界风险**：UI 菜单部分接近插件可表达范围，但共享资源内核与生命周期判据一边倒，风险低。

**落点建议**
- `core/`：活动工作根到 ResourceIO/Knowledge workspace runtime 的单一 owner 绑定与切换失效；具体接入 `<Path>core/engine.ts</Path>`、`<Path>core/workspace-runtime/</Path>`、`<Path>core/knowledge-workspace/</Path>`。
- `server/`：Knowledge/ResourceIO route 只解析同一 owner，保持现有地址、错误、plan/commit 与安全契约；具体接入 `<Path>server/routes/knowledge-workspace.ts</Path>`、`<Path>server/routes/resource-io.ts</Path>`、`<Path>server/composition/open-root.ts</Path>`。
- `desktop/`：Knowledge resource tree 复用 Desk file-kind、preview、ContextMenu 与 native grant；具体接入 `<Path>desktop/src/react/components/knowledge-workspace/</Path>`、`<Path>desktop/src/react/utils/remote-file-preview.ts</Path>`、`<Path>desktop/src/react/components/desk/DeskTree.tsx</Path>`。

**下游衔接**：进入 `specdev` 工作流的 G → S → T → I；不生成插件脚手架。
