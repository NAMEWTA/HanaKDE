# 恶意工作区威胁模型

本矩阵把威胁、控制、自动化和 owner 连接起来。安全用例使用真实临时文件系统；字符串模拟不能替代 symlink、junction、权限、rename、case 和崩溃恢复。

| ID | 资产/边界 | 攻击者 | 前提 | 威胁 | 强制控制 | 自动化证据 | Owner tickets | 残余风险 |
|---|---|---|---|---|---|---|---|---|
| TM-001 | 来源外文件 | 恶意 workspace | 可创建 symlink | symlink/junction 越界或循环 | ProviderRootIdentity + PathGuard + commit scope recheck | 真实 symlink/junction read/write/watch/index/trash | 05,14 | 拒绝不支持 identity 的 provider |
| TM-002 | 来源隔离 | 本地用户/外部工具 | 路径可变 | TOCTOU 替换根或父目录 | scopeToken + expected version + prepare/commit recheck | 替换 symlink/mount 后 commit | 10,14,54 | 底层 FS 无法提供强 identity 时 fail-closed |
| TM-003 | 本机路径隐私 | 远程客户端 | 可调用 route | 绝对路径、UNC、盘符或错误回显 | unknown schema + safe errors + no path DTO | LAN absolute path payload/response snapshot | 03,04,09,14 | Main 内部仍可见路径 |
| TM-004 | 资源 identity | 恶意文件名 | 大小写/Unicode 别名 | 重复 identity 或跨根别名 | provider canonical identity + exact relativePath | case-sensitive/insensitive/Unicode fixtures | 05,14 | 跨平台显示可能不同但 identity 确定 |
| TM-005 | 日志隐私 | 错误输入 | 控制字符/敏感正文 | 日志注入或内容泄露 | redactor + structured diagnostics | control chars/token/body assertions | 04,14 | 管理员仍可见脱敏地址 |
| TM-006 | Renderer | 恶意 Markdown | 打开文件 | HTML/SVG/URI 主动内容执行 | sanitizer + protocol allowlist + user gesture | script/event/javascript/data/SVG fixtures | 14,35 | 浏览器/系统打开外链仍有外部风险 |
| TM-007 | Renderer | 恶意 Mermaid | 渲染图表 | 配置注入、事件绑定或过期任务覆盖 | fixed strict config + discard bindFunctions + SVG sanitize + stale-result guard/cancel | malicious config/SVG + race tests | 14,33 | Mermaid library vulnerabilities 需依赖更新 |
| TM-008 | 内存/CPU | 恶意大文件 | 打开/索引 | 压缩炸弹、超大媒体、巨型文本 | read 前 stat + Content Gate + limits + cancel | 10 MiB boundary/bomb/spy-read fixtures | 13,14,17,19,42 | metadata 读取仍有有限成本 |
| TM-009 | .trash | 本地外部工具 | 可修改隐藏目录 | manifest/目录替换导致越界或丢失 | dedicated capability + identity recheck + journal | replace .trash during delete/restore | 14,55,56 | 外部强制删除无法恢复 |
| TM-010 | 索引 | 损坏/旧进程 | 可写 HANA_HOME | DB/WAL/manifest 损坏或锁冲突 | generation + quick_check + writer lock | corrupt DB/WAL/current/lock | 14,40,43 | 旧 generation 也损坏时只能 rebuild |
| TM-011 | 索引正确性 | 事件丢失/乱序 | watcher 不可靠 | stale/duplicate index | sequence + disk reread + reconcile | gap/replay/burst/duplicate | 43 | 极端持续 churn 可保持 stale 状态 |
| TM-012 | 复合操作 | 进程崩溃 | mutation 进行中 | 半移动、半重写或丢失结果 | durable journal + recovery barrier | 每个 named failure point restart | 10,54,55,56 | RECOVERY_REQUIRED 需用户处理 |
| TM-013 | Native bridge | 恶意 Renderer | 可调用 IPC/普通 server token | 任意本机路径操作或直接调用 Main-only route | loopback + authenticated local principal + Main-only credential + single-use grant/action/window binding | wrong credential/replay/wrong action/expired grant | 03,14,51,56 | Electron Main 被攻陷不在应用层防护范围 |
| TM-014 | 导入 | 恶意外部目录 | picker/clipboard | symlink、特殊文件、无限目录 | Main-to-Server plan + no-follow + 100k entries/128 depth/100GiB limits | symlink/device/deep tree/limit/cancel | 14,51 | 外部文件读取权限由 OS 决定 |
| TM-015 | 系统废纸篓 | 平台不可用 | cleanup | 永久删除或 manifest 先移除 | capability check + journal + success ack | shell.trashItem failure/unavailable | 56 | 系统废纸篓自身保留策略由 OS 控制 |
| TM-016 | owner/scope | 其他会话 | 已认证但非 owner | 跨 session/source 访问 | owner context on every route/grant | wrong owner/window/source tests | 03,09,14 | 共享 OS 账户不是强租户隔离 |
| TM-017 | Open boundary | Full 实现 | 构建时依赖 | 动态绕过开放边界 | static composition + boundary lint | open build/import graph | 01,03,57 | 依赖许可需持续审计 |
| TM-018 | 测试数据 | CI/开发机 | 自动化运行 | 读取或破坏真实 home | isolated temp HANA_HOME/workspace | assert paths under temp root | 01,14,57 | OS native integration 仍需平台 runner |
| TM-019 | HTTP 身份 | 已认证恶意客户端 | 可构造 body | 注入 principal/user/studio/owner 越权 | principal only from authenticated Hono context + schema reject identity fields | forged identity against Knowledge/ResourceIO routes | 03,06,09,14 | 上游认证本身不在本 change 重做 |
| TM-020 | 跨 provider 复制 | 恶意/超大来源 | 可触发 copy/import | 内存耗尽、半目录、staging 越界或路径泄露 | 1MiB chunk/4 streams/8MiB buffer + sibling staging + scope recheck + no Renderer path | huge file/cancel/partial directory/provider-pair matrix | 06,14,38,51,52,53 | provider 快速路径正确性仍由 provider 测试保证 |

## 发布要求

- TM-001—TM-020 全部必须有实际通过或明确未执行状态。
- Windows 必须执行 junction、UNC、case-insensitive 与 system trash；macOS/Linux 执行各自 case 与 symlink。
- 任一 fail-open、路径/正文泄露、永久删除 fallback 或 journal 丢失为发布阻断。
- 新增 trust boundary 必须先追加或修订对应 LOG，再同步必要 ADR、CONTEXT、spec/契约、本矩阵与对应 ticket；不得遗漏既有 accepted 安全结论。
