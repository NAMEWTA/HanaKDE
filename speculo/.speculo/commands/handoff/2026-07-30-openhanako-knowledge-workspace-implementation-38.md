# OpenHanako 知识工作区实施交接 38

## 已关闭

- Tickets 01–38 已关闭，共 38/57；M2/P1/P2 Markdown 阶段完成 16/17。
- Ticket 38 主线实现提交为 `f68345f0`。
- 同来源 Page/Asset 直接写 source-relative Wikilink；跨来源 Page 整文件复制到页面目录，Asset 与系统文件复制到同级小写 `assets/`，成功后才插入引用。
- 附件名使用日期前缀，缺名回退 `image.ext`，冲突在最后扩展名前使用 `_2`、`_3`；副本正文/字节不清理、不迁移、不重写。
- 内部与外部复制统一经 ResourceIO transfer；外部 RequestBody provider 一次性分块输出，Renderer 不接触 Node 文件系统、绝对路径或整文件 byte buffer。
- 单资源正式目标原子；批次按输入顺序允许部分成功。取消、冲突、权限/来源不可用、长度不符、`assets` 被文件占用均不插入失败项链接或留下正式半文件。
- 成功项每项一行 Markdown，安全静态媒体使用 embed Wikilink，Page 与不支持嵌入的文件使用普通 Wikilink；整批由一个 CM6 transaction 插入。
- Undo 只删除正文引用并保留复制文件；Redo 重新复制原始项，按当前冲突状态生成新名称后写入新引用。
- Engine public facade、Knowledge route、`files.write` 授权、Renderer client、编辑器策略和五语言非阻塞错误提示已贯通；opaque 外部元数据与内部拖放 payload 都有严格字段、数量和字节上限。
- Ticket 精确 2 files、17/17；最终硬化核心定向 5 files、79/79；ResourceIO/editor/groups/i18n 相关定向 10 files、65/65。
- 最终产品范围全仓 1055 files，1054 passed、1 skipped；10625 tests，10619 passed、6 skipped、0 failed。
- typecheck、boundary、目标 ESLint、diff check、Renderer、Open Server 与 Full Server production build 通过；Full Server 使用的一次性临时 Ed25519 签名材料已删除。
- E2E-KW-010 尚不存在；仓库只有 E2E-KW-001 spec。Ticket 53 真实编辑器/资源树拖拽入口完成后必须补建并执行，最终发布前不得保留。

## M2 当前状态

- Ticket 39 是 M2 唯一剩余票；复用 Ticket 37 navigation/completion seam、Ticket 35 安全渲染与 Ticket 33 Mermaid/math，只读取同来源 Page/section，派生 embed 不写回正文。
- Ticket 38 的附件粘贴/拖入只拥有“复制后引用”语义；Ticket 53 仍拥有资源树与编辑器统一拖拽预检、effect 和批次反馈，不能把当前有上限的内部 MIME seam 当作 Ticket 53 已完成。
- Ticket 52 可复用本票 ResourceIO copy service、冲突命名和逐项结果，但仍须交付会话内 copy/cut/paste、同源 move 与跨来源 cut 拒绝/显式转复制。

## 下一步

1. 实施 Ticket 39：同源页面与章节嵌入，关闭 M2。
2. 进入 Ticket 40：来源分区索引 Store 与 Schema。
3. 按依赖顺序完成 Tickets 41–46，再进入 Tickets 47–56。

## 保护边界

- 跨来源必须先复制再引用；不得创建跨来源持久链接、猜测同名目标、迁移身份、删除来源或重写来源正文。
- Page 副本只能进入当前页面目录；Asset/系统文件只能进入页面同级小写 `assets/`，目录被文件占用时不得 fallback 到其他位置。
- 跨 provider copy 只能经 ResourceIO transfer；不得在 Renderer 使用 Node 文件系统、绝对路径、完整 byte buffer 或 provider 私有能力。
- 复制成功前不得插入链接；单资源必须原子，批次只允许稳定输入顺序的显式部分成功。
- Undo 不能删除已复制文件；Redo 必须重新复制并接受新的确定冲突名，不能复用已撤销引用指向的旧副本。
- 内部 MIME 只是有上限的 source-scoped 编辑器入口，不替代 Ticket 53 的统一 drag contract、预检 UI 和树 effect。
- E2E-KW-010 必须使用后续真实公开入口，不能添加私有 route 或缩减发布场景。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
