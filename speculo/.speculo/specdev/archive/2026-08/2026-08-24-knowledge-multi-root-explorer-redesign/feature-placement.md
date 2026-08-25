# 功能落点裁决：Knowledge 多根目录树重设计

**功能本质**：消费既有 Knowledge sources、ResourceIO、Desk 文件类型与树交互能力，新增 Desk/Knowledge 共用的树行渲染接口；不新增数据产物，用户看到的是既有系统资源状态的统一投影。

**落点**：HanaKDE 系统本体

## 判据

1. **修改特权子系统**：不适用；不修改会话、Provider、权限、执行边界或迁移。
2. **定义被别人依赖的契约原语**：破盒子；新的共享树行接口由内置 Desk 与 Knowledge Renderer 共同依赖。
3. **必须启动即常驻**：不适用；随对应页面渲染。
4. **可整块删除性**：破盒子；删除共享树行会使两个内置系统页面无法编译。
5. **可用贡献面表达**：破盒子；插件 page 只能新增第二套页面，不能替换内置 Knowledge 与 Desk 的现有渲染子树。
6. **权限自洽**：能装进盒子；本次不需要新增或绕过权限，但不足以推翻破盒硬门。
7. **产物归属**：不适用；不创建插件私有数据或系统级新状态。

## 关键判据

- **支持该落点**：命中共享契约原语硬门，且必须编辑内置 Renderer；插件贡献面无法表达目标。
- **反对该落点（最强反方）**：插件可以贡献独立 page 并消费 Knowledge API；但会形成第二个 Knowledge 页面，保留当前严重问题，不能满足替换与复用要求。

**边界风险**：低。目标明确指向内置 Knowledge 与当前聊天工作台之间的共享渲染。

## 落点建议

- 所属层：`desktop`。
- 具体接入点：<Path>desktop/src/react/components/shared/WorkspaceTreeRow.tsx</Path>、<Path>desktop/src/react/components/desk/DeskTree.tsx</Path>、<Path>desktop/src/react/components/knowledge-workspace/KnowledgeResourceTree.tsx</Path> 与 <Path>desktop/src/react/components/knowledge-workspace/KnowledgeLayout.tsx</Path>。
- 暴露给上层的契约：纯 Renderer tree-row props；不拥有来源、选择、加载、拖拽或 mutation 状态。

**下游衔接**：进入 SpecDev UI prototype，再由 Spec/Implement 推进生产实现。
