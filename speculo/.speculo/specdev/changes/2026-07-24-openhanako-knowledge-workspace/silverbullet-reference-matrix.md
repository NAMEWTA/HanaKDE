# SilverBullet 可审计参考矩阵

## Snapshot

| 项 | 值 |
|---|---|
| 仓库内位置 | `silverbullet/`（被 `.gitignore` 排除，不作为运行依赖） |
| package | `@silverbulletmd/silverbullet` |
| 版本 | `2.9.0` |
| Node 要求 | `>=24.13.0` |
| 许可证 | MIT，Copyright 2022 Zef Hemel |
| Git provenance | 本地目录不含独立 `.git`；使用选定文件 SHA-256 固定 snapshot |

采用规则：允许研究、独立改写或小范围复用；复用代码必须更新本矩阵，并在仓库根维护第三方声明（许可证原文见 `silverbullet/LICENSE.md`）。禁止移植 Preact UI、Rust Server、Space Lua、plugin runtime、query/object database 和 SilverBullet page identity。

## 能力矩阵

| 能力 | 参考文件 | 只采用 | HanaKDE 落点 | 采用级别 |
|---|---|---|---|---|
| Editor state/compartment | `silverbullet/client/codemirror/editor_state.ts` | extension 分层与生命周期 | `desktop/src/react/editor/` | 思路/小段适配 |
| Wikilink | `silverbullet/client/codemirror/wiki_link.ts` | decoration、completion、navigation command 拆分 | Knowledge link field/commands | 思路/小段适配 |
| Frontmatter | `silverbullet/client/codemirror/frontmatter.ts` | 编辑投影边界 | frontmatter projection/field | 思路；保真算法独立 |
| Footnote | `silverbullet/client/codemirror/footnote.ts` | 定义/引用交互 | knowledge footnote field | 思路/小段适配 |
| Enter commands | `silverbullet/client/codemirror/markdown_enter.ts` | transaction case matrix | knowledge enter commands | 小段适配允许 |
| Paste | `silverbullet/client/codemirror/editor_paste.ts` | paste interception ordering | Knowledge attachment policy | 思路；文件协议独立 |
| Markdown parser | `silverbullet/client/markdown_parser/` | parser/editor/index 分离 | Markdown Knowledge IR | 思路；不得引入 runtime |
| Space | `silverbullet/client/spaces/` | 受控文件空间责任划分 | SourceRegistry/ResourceIO adapter | 只研究接口边界 |
| Index | `silverbullet/plugs/index/` | extractor/index/query 分层 | source-partitioned index | 只研究模块化 |

## 内容钉选

本矩阵「参考文件」列即审计范围。`silverbullet/` 本地目录通常无独立 `.git`，版本号不能替代内容核对：Ticket 02 与实现复用前，应对矩阵列出的具体文件做存在性检查，并在交付记录中记下路径与内容摘要（或 SHA-256）；合入复用代码的同一 commit 必须更新本矩阵。
