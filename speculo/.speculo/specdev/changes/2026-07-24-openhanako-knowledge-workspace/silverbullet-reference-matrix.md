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

`silverbullet/` 本地目录无独立 `.git`，版本号不能替代内容核对。2026-07-25 已记录以下 SHA-256；Ticket 02 必须重新计算并比较，任何漂移都先更新采用审计，不按旧内容猜测。

### 单文件 SHA-256

| 路径 | SHA-256 |
|---|---|
| `silverbullet/client/codemirror/editor_state.ts` | `d10ae7e14acc1a08160fa1189eb6ca3341d86f19362fac7b6b4b84193c9268fc` |
| `silverbullet/client/codemirror/wiki_link.ts` | `cb8c94a6140b4c1a6ab0aec0927628a8273ed0a36ce4fa99a0472868087b2a18` |
| `silverbullet/client/codemirror/frontmatter.ts` | `67c200ef9a6a1456b094177782bfd0557013420c848e3a572670662d623a0eb4` |
| `silverbullet/client/codemirror/footnote.ts` | `3a8d1ee1753facf03a7d70db31d2b538223ae7b7ed83c00e47807247aa09fd98` |
| `silverbullet/client/codemirror/markdown_enter.ts` | `4a36918604d69ee89ffc8f6f2138f2a0ec2d62b40c93923c01112ca7e65e7822` |
| `silverbullet/client/codemirror/editor_paste.ts` | `3065347228c4816f58bb92dec907c3e48fefd80d136db01b9002c7bc32b2a8b5` |
| `silverbullet/package.json` | `74107b19514c8885a2ef2e9272c1bcb857aba19f6a6bd277e0430703244954ea` |
| `silverbullet/LICENSE.md` | `ccf525a3b5c9ac8d843e118932036e6517d4d603f9ff3e474522b632c3996c65` |

### 目录聚合 SHA-256

目录聚合算法固定为：在仓库根对目录内全部普通文件按路径 byte order 排序；逐文件生成与 `shasum -a 256` 等价的 `<hash><two spaces><repo-relative-path>\\n`；再对完整清单计算 SHA-256。符号链接不得跟随，若出现符号链接则审计失败。

| 目录 | 文件数 | 聚合 SHA-256 |
|---|---:|---|
| `silverbullet/client/markdown_parser/` | 13 | `b149b4b80e76e33cdc3fa4fa8153a53533c1f692b47a972387f1683231435d07` |
| `silverbullet/client/spaces/` | 11 | `f9418090b736dfa7e912d5024cc99e91ad5963147a04161a7e5ebb5ae42b00b1` |
| `silverbullet/plugs/index/` | 57 | `b34b8d7ee9242798e8eba7a5cfbe157fbb4dcac17ae5c93e74cb4bd4e50e3184` |

本矩阵「参考文件」列与上述哈希是完整审计范围。合入任何复用代码的同一 commit 必须更新采用级别、HanaKDE 落点、哈希和仓库根第三方声明；独立改写也应在实现注释或测试中保留能追溯到矩阵行的 provenance。
