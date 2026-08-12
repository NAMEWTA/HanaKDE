# OpenHanako Knowledge Workspace Architecture

- Promoted: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/architecture.md</Path>`
- Status: Current implementation architecture

## 系统边界

Knowledge 直接扩展现有 Desktop/LAN/Mobile Renderer 与 Open composition，不创建新顶级应用或第二个 Server。Open composition 拥有来源注册、ResourceIO、操作、索引、查询和 native grant 公共协议；Full composition 只注入 Desk 产品差异。

Server 是 SourceRegistry、Operation Journal 与 Index 的唯一 owner。Renderer 只持有地址化 session/view 投影，不接收 resolved path、provider root identity 或 scope token。

## 地址与来源

跨端地址固定为 `{ sourceKey, relativePath }`。SourceRegistry 通过 provider root identity 把它解析为既有 `ResourceRef`。注册顺序为 schema、owner/scope、capability、root identity、与活动根关系、sourceKey 冲突、commit；任何非 `disjoint` 关系都拒绝。

## 数据流

普通单资源访问复用 `/api/resource-io/*`。复合 create/copy/import/move/rename/delete/restore/cleanup 统一通过 operation plan/commit；trash route 只查询或生成 plan。Operation Journal 负责持久 intent、outcome 和启动恢复。

DocumentSession 共享 buffer、baseline、version、history、dirty 和 conflict；DocumentView 独立 cursor、selection、scroll、mode 与 group。Knowledge 使用 expected-version 手动保存，未保存 buffer 不进入 Server 索引。

Markdown Knowledge IR 在 Renderer/Server 间共享；CM6 tree 只属于 Renderer。每来源索引使用独立 SQLite generation 与原子 manifest 切换。

## 安全与存储

所有公开 body 以 unknown 接收并做 schema 校验；principal/owner/scope 只来自认证 context。内容在 read 前经过 stat 和 Content Gate。原生操作采用 Main-only credential 加单次 grant。

索引、journal 和 source binding 位于 `<HANA_HOME>/knowledge-workspace/`。来源内只有 `.trash/` 是内部区域，且必须从普通树、搜索、索引和链接解析排除。
