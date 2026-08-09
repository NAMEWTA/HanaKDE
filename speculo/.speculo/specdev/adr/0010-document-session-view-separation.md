# ADR-0010: 文档会话与文档视图分离

- Status: Accepted
- Date: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/ADR.md</Path>` (`ADR-0292`)

## 决策上下文

同一页面可以多视图打开，内容状态应共享而交互位置应独立。

## 决策

同一 `KnowledgeResourceAddress` 的 buffer、baseline、version、history 和 dirty 状态共享；每个 view 的 cursor、selection、scroll 和 mode 独立。普通打开复用已有 view，仅显式侧边打开创建第二 view。

## 后果

多视图不会产生相互冲突的文档副本，但 session 生命周期和 view 投影必须分层管理。
