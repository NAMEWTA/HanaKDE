# Knowledge 工作区资源内核与文件树交互

**工作目录**：聊天/工作台当前选择的活动工作根，也是 Knowledge 协议固定 `main` 来源的真实根。
_Avoid_: 把每个 agent 会话的授权目录当作 Knowledge 挂载来源

**挂载目录**：Knowledge workspace 会话显式注册、可与 `main` 并列管理的额外来源；挂载目录具有独立 `sourceKey` 和 provider scope。
_Avoid_: 授权目录、默认跨会话挂载

**ResourceIO owner**：绑定当前活动工作根和已授权挂载 provider 的单一 ResourceIO/事件 owner；Knowledge registry、公开资源路由和复合 operation coordinator 必须消费同一实例。
_Avoid_: Knowledge 私有 ResourceIO、按 route 临时创建的第二 owner

**资源树上下文菜单**：复用工作台 ContextMenu 与资源动作能力，根据来源能力和 native grant 可用性投影的文件/文件夹操作集合。
_Avoid_: 只属于 Knowledge 的另一套文件管理语义

**跨来源剪切**：源地址与目标目录 `sourceKey` 不同时的 cut 请求；默认 fail closed，要求用户改用 copy。
_Avoid_: 静默降级为跨来源移动

**文件类型打开策略**：资源先按既有 `file-kind` 与 Workbench/FileRef preview 能力判断；具备有效 NativeResourceGrant/本地路径时才允许默认应用或 reveal。
_Avoid_: Knowledge 私有 parser、伪造原生成功

**创建提交屏障**：创建请求从第一次 submit 开始不可重入；成功先卸载对话框，再执行单次资源树定位和页面打开投影。
_Avoid_: 在成功回调期间继续保留可点击 modal
