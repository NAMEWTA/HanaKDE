# 落点裁决：内置插件

**功能本质**：为个人投资研究者提供一个可视、可审计、可由 Agent 调用的金融研究工作台，消费 Hana 已有的页面、工具、路由、网络、资源、模型、Session/Agent 与后台任务能力；新增的是插件私有的金融数据适配、研究工作流、指标/策略/回测编排和研究记录；产物归插件私有数据、用户资源或 SessionFile，不成为 Hana 的系统级共享状态。

**裁决**：内置插件。

**逐条判据**

1. **需要修改特权子系统：能装进盒子。** 首选设计只消费 Hana 已暴露的 SDK、EventBus、ResourceIO、模型和任务能力，不改写会话、Provider Registry、权限主体或系统迁移。若后续确认必须新增通用量化运行时、原生 TCP/进程能力或系统数据迁移，应拆出独立系统前置 change，不能塞回金融插件。
2. **定义被别人依赖的契约原语：能装进盒子。** 金融能力只服务本插件；对外可选能力必须允许缺失并优雅降级，插件不拥有新的系统 Registry。
3. **启动即常驻且不可按需激活：能装进盒子。** 页面、工具和研究流程可按打开页面或调用工具激活；监控/同步任务即使使用启动激活，也只是可删除的插件任务，不得成为 Hana 启动前置。
4. **可整块删除性：能装进盒子。** 删除 `<Path>plugins/finance-workbench/</Path>` 后只失去金融工作台，Hana 的会话、模型、资源与其他插件仍完整运行。
5. **可用贡献面表达：能装进盒子，存在待验证边界。** 预期由 page/widget、routes、tools、skills、configuration、lifecycle、EventBus 和 TaskRegistry 表达。Python 量化库、TCP 行情、长时间计算、流式进度与本地子进程是否能完全落在公开插件契约内，交由 Wayfinder 专项调查；不能表达的部分必须降级、外置或另立系统 change。
6. **权限自洽：能装进盒子，采用 full-access。** 外部 HTTP 只经 `ctx.network.fetch()` 和白名单；用户文件只经 `ctx.resources`；密钥只经 `ctx.config`；模型推理经 `sampleText()` 或插件私有 Session/Agent；iframe 只调用同插件 route。不得绕过权限系统或把秘密放进前端资产。
7. **产物归属：能装进盒子。** 行情缓存、索引和任务状态属于插件私有存储；研究笔记、导出报告和用户数据通过 ResourceIO 或 SessionFile 交付；不得创建未经契约管理的全局数据库或跨插件共享状态。

**支持该落点**

- 它是一个领域应用与工作流入口，主要消费 Hana 的稳定能力，结构上接近现有 `media`、`mcp` 等“插件包装系统能力”的原型。
- 页面、Agent 工具、同插件 API、配置、私有存储、后台任务和模型辅助均已有插件贡献面。
- 可按目录删除、可按需激活、可在权限声明中自洽，是强插件信号。

**反对该落点（最强反方）**：完整量化平台常包含高频或 TCP 行情、Python/本地库、长期调度、大规模时序存储、SSE/任务恢复和策略执行沙箱；若这些被定义成其他插件也依赖的通用基础设施，或要求系统身份、原生进程和全局迁移，就会命中“特权子系统/契约原语”硬门。该反方尚未翻盘，因为本 change 的功能本质被限定为插件拥有的个人研究工作台，不预先承诺建立 Hana 通用量化内核。

**边界风险**：中等。产品落点明确偏插件，但量化计算运行时、实时行情协议和后台持久任务是必须用代码与 SDK 契约验证的边界。

**落点建议**

- 目录：`<Path>plugins/finance-workbench/</Path>`。
- 贡献面：page 为主工作台；可选 widget；routes 作为浏览器与数据/任务后端边界；tools 供 Agent 调用；skills 提供投研纪律；configuration 管理数据源与非敏感偏好；lifecycle/TaskRegistry 管理可恢复同步和监控。
- 权限：`full-access`。候选 capabilities 包含 `network.fetch`、`model.sample`、按实际使用声明的 session/agent、ResourceIO read/write/materialize，以及 UI hostCapabilities；最终清单必须遵守最小权限。
- SDK 约束：iframe 使用 `hana.api.fetch()`；第三方请求只在 Node 侧使用 `ctx.network.fetch()`；首屏不自动调用 LLM；密钥只存 `ctx.config`；用户资源不使用裸 `fs`；插件生成文件通过 SessionFile 交付。

**下游衔接**：先完成当前 Wayfinder，收敛产品、数据、金融正确性、UI 与运行时边界；之后进入 Spec，再由 `hana-plugin-creator` 的 professional React/full 模板和 dev loop 驱动实现。当前不生成脚手架。
