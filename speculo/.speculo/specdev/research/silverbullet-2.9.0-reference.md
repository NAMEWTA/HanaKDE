# SilverBullet 2.9.0 Reference

- Promoted: 2026-08-09
- Source: `<Path>{roots.state}/specdev/archive/2026-07/2026-07-24-openhanako-knowledge-workspace/silverbullet-reference-matrix.md</Path>`
- Status: Audited reference baseline

## Snapshot

仓库内 `silverbullet/` 是 `@silverbulletmd/silverbullet` 2.9.0 的受控参考快照，不是运行依赖。许可证为 MIT，Copyright 2022 Zef Hemel。允许研究、独立改写或小范围适配；禁止移植 Preact UI、Rust Server、Space Lua、plugin/query/object database runtime 和 SilverBullet page identity。

审计能力范围包括 CodeMirror editor state、Wikilink、Frontmatter、footnote、Enter、paste，以及 Markdown parser、Space 抽象和 index 分层。任何复用必须记录采用方式、HanaKDE 落点、hash 与 notice 义务。

## 固定哈希

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

目录聚合：`markdown_parser/` 13 文件为 `b149b4b80e76e33cdc3fa4fa8153a53533c1f692b47a972387f1683231435d07`；`spaces/` 11 文件为 `f9418090b736dfa7e912d5024cc99e91ad5963147a04161a7e5ebb5ae42b00b1`；`plugs/index/` 57 文件为 `b34b8d7ee9242798e8eba7a5cfbe157fbb4dcac17ae5c93e74cb4bd4e50e3184`。

参考快照漂移时必须先更新采用审计，不得按旧内容继续适配。
