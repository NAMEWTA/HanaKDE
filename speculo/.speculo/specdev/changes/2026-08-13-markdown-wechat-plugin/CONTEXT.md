# Markdown WeChat Plugin

**公众号排版文档**：以 Markdown 源文为输入、以公众号风格 HTML 预览和可复制富文本为主要交付的插件内文档；其设置、主题和草稿是否持久化由本 change 的设计树决定。
_Avoid_: 系统级文章、全局编辑器文档

**参考项目**：`<Path>temp/md-wechat/</Path>` 中固定提交的 Vue/Vite 应用，仅用于提取候选行为、渲染语义和测试意图，不是 HanaKDE 的运行时合同。
_Avoid_: 直接迁移、参考项目即权威

**插件私有产物**：只属于 Markdown 公众号排版插件的文档、设置、缓存和内部状态；需要交付给用户的 HTML/Markdown 文件必须通过 SessionFile 或 ResourceIO 的显式路径进入用户资源边界。
_Avoid_: 隐式工作区写入、插件绕过 ResourceIO

**v1 核心闭环**：本 change 首版必须覆盖 Markdown 编辑、实时公众号预览、主题/字号/字体调整、核心 Markdown 语法、富文本复制和 Markdown 导入/导出；高级图片/视频处理、多文档回收站与图床不属于首版。
_Avoid_: 完整迁移参考项目、隐含高级媒体依赖

**Page + Widget 贡献面**：Page 是完整排版编辑/预览工作台的唯一权威入口；Widget 只提供快速入口或轻量最近文档入口，不复制编辑器状态。
_Avoid_: Widget 作为第二编辑器、双重文档状态

**纯产出排版工具**：Agent 可调用的只读工具，输入 Markdown 字符串或 ResourceRef，输出渲染 HTML/SessionFile；它不直接修改用户工作区。
_Avoid_: Agent 直接覆盖工作区、宿主绝对路径参数

**插件私有持久化**：Markdown 文档、主题选择、编辑器设置和草稿状态由插件私有数据存储管理；它们不是用户工作区资源，也不以 iframe 浏览器存储作为唯一权威。
_Avoid_: 隐式工作区文件、iframe storage authority

**显式文件交付**：Markdown 导入通过宿主资源选择与 ResourceIO 读取；Markdown/HTML 导出默认作为 SessionFile 交付；工作区写回必须是用户另行选择路径后的显式 ResourceIO 操作。
_Avoid_: 隐式工作区写回、绝对路径交付、伪造 MEDIA 输出

**v1 本地媒体边界**：v1 只承载本地图片/视频预览及公众号复制需要的占位语义，不提供第三方图床上传或外部网络媒体托管。
_Avoid_: v1 图床、隐式网络上传、iframe 直连第三方服务

**迁移边界**：v1 不读取或迁移参考项目的 localStorage、IndexedDB 或 SQLite；未来真实迁移需求必须通过独立的版本化 JSON importer 设计确认。
_Avoid_: 猜测旧格式兼容、浏览器数据库扫描

**首版发布硬门**：内置插件加载/删除、Page/Widget 可用、资源权限、核心 Markdown 渲染和富文本复制是 v1 阻塞验收；主题数量与视觉细节通过关键覆盖验证，不得掩盖宿主边界失败。
_Avoid_: 视觉优先于宿主合同、用截图掩盖权限错误
