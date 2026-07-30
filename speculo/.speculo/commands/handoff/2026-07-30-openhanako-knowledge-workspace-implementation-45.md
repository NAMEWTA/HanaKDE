# OpenHanako 知识工作区实施交接 45

## 已关闭

- Tickets 01–45 已关闭，共 45/57；M3 索引/查询阶段完成 6/7。
- Ticket 45 主实现提交为 `60a9047b`，游标与响应式契约收口提交为 `3581ad93`。
- 新增宽容搜索词法：短语、资源内 AND、独立大写 `OR`；NFC 与 locale-neutral lowercase 后执行连续子串匹配。
- 3+ code points 使用 trigram FTS 候选并再次确认连续子串；1–2 code points 使用每批 256 行的有界可取消扫描，短查询不漏结果。
- main 首组、挂载按会话顺序；各来源独立评分和分页，不跨来源 join 或统一排名，也不进入 LinkResolver 回退。
- 每来源默认/最大 50/100，query 最大 512 code points，最多 3 个、每个 240 code points 的片段。
- cursor 绑定 sourceKey、generationId、规范化查询、标签筛选域、固定排序键与 offset；代际漂移明确返回 stale generation。
- 新增公开 search route、唯一 Renderer client 解析和真实 Knowledge shell 搜索 UI；结果打开已有编辑组，标签点击进入可见且可清除的单来源范围。
- Arrow/Escape、ARIA live/focus、zh-CN/zh-TW/en/ja/ko、亮暗主题和两档窄布局已覆盖；单来源不可用/故障不影响其他来源。
- 搜索核心/UI/client/route/i18n/style 定向 75/75；持久化 tripwire 21/21；CLI closure 19/19。
- 最终产品范围全仓 1065 files，1064 passed、1 skipped；10727 tests，10721 passed、6 skipped、0 failed。
- typecheck、boundary、目标 ESLint、diff check、Renderer build 与 Open Server build 通过；better-sqlite3/jieba runtime smoke 通过。
- 只读搜索协议不改变 schema、持久化字节、ownership、checkpoint/restore policy、`DATA_EPOCH` 或用户事实；compatible 指纹为 `sha256:bb339f753e04f2034c41c7d16d2e3e37fe5be889be8509b3178949adcf429fc7`。
- E2E-KW-013 当前不存在且未运行；没有用 Vitest 或私有入口冒充发布 E2E。

## 下一步

1. 实施 Ticket 46：当前 Renderer buffer 的 outline/outbound 与已保存 backlinks 的真实 UI。
2. 完成 Ticket 46 后补建并执行 E2E-KW-013 的真实产品入口流程。
3. 继续 Tickets 47–56 的资源树交互与资源操作，再由 Ticket 57 执行完整发布 Gate。

## 保护边界

- Ticket 46 的当前 outline/outbound 必须读取未保存 Renderer buffer；Server backlinks 只读已保存索引，必须明确区分事实来源。
- 当前资源切换、未保存编辑、保存后 generation 刷新与来源故障不能把旧视图误标成当前事实。
- query/search/view DTO 不得包含正文全集、绝对路径、数据库位置、凭证、原始链接文本或未脱敏 provider/SQLite 错误。
- 不得把超级搜索用于 LinkResolver fallback，也不得跨来源统一排名、join 或用一个来源 cursor 推进另一个来源。
- E2E-KW-013 当前不存在；不得用私有 route、测试捷径、Vitest 或缩减场景伪装发布 E2E。
- 用户的 `.gitignore` 以及 ignored `temp/**`、`teach/**` 内容不属于本 change，不能随 ticket 提交。
- 只有 Lead 操作 Git；不覆盖用户修改。
