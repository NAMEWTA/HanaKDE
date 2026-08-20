# Git 分支模型

HanaKDE 是 `liliMozi/openhanako` 的 fork。长期只保留两条远端分支：只读上游镜像，以及产品主线。日常开发和上游吸收都从产品主线分出短生命周期分支，合并后删除。

## 拓扑

```text
upstream/main                 OpenHanako 上游默认分支
      │  定时 / 手动，仅 fast-forward，禁止 tags
      ▼
origin/main                   纯镜像，不含 HanaKDE 提交
origin/hanakde                产品主分支与 GitHub 默认分支
      │
      ├── feature/<topic>     日常产品开发，PR 合入 hanakde 后删除
      └── sync/upstream-vX.Y.Z
                              冻结上游 named tag 的吸收分支
                              --no-ff merge → PR 合入 hanakde 后删除
```

`feature/*` 与 `sync/upstream-v*` 是从 `hanakde` 分出的两类同级临时分支。同步分支不得从 feature 分支创建，也不得把 `origin/main` 当作开发或吸收基线。

## 分支职责

| 分支 | 来源 | 允许操作 | 禁止 |
|---|---|---|---|
| `origin/main` | `upstream/main` 的 fast-forward | 由 [`.github/workflows/sync-upstream-mirror.yml`](../.github/workflows/sync-upstream-mirror.yml) 或等价的 `--ff-only` 推送更新 | 提交 HanaKDE 改动、force-push、推送 tags、直接开发 |
| `origin/hanakde` | 产品历史 | 通过 PR 合入 `feature/*` 与 `sync/upstream-v*` | force-push、删除、把未冻结的 `upstream/main` 直接 merge 进来 |
| `feature/<topic>` | `hanakde` | 日常开发、PR 到 `hanakde` | 长期驻留、直接吸收上游 tag |
| `sync/upstream-vX.Y.Z` | `hanakde` | 冻结 named tag 后 `--no-ff` merge、五类裁决、验证、PR 到 `hanakde` | squash / rebase 上游历史、在 diamond 与 ledger 记录完成前删除、作为永久分支保留 |

## 上游同步

1. `git fetch upstream --tags`，冻结 **named tag**（例如 `v0.447.5`），记录 SHA；不要用会移动的 `upstream/main` 当本轮输入。
2. 从当前 `hanakde` 创建 `sync/upstream-vX.Y.Z`。
3. `git merge --no-ff <tag>`，按 [upstream-sync-ledger.md](../upstream-sync-ledger.md) 的五类词汇分类 overlap。
4. 从合并后的源码重生 generated receipts；跑合同测试与适用平台门。
5. PR 合入 `hanakde`。验收标准：`git merge-base --is-ancestor <tag> hanakde` 成功，Git Graph 可见 diamond。
6. 打产品证明 tag `hanakde-includes-vX.Y.Z`。删除本地和远端 `sync/upstream-vX.Y.Z`。长期证据是 ancestry、ledger 和证明 tag，不是永久 sync 分支。

## Tag 边界

| Tag | 位置 | 用途 |
|---|---|---|
| 上游 `v*` / `train-*` | 只存在于 `upstream` 和本地 | 冻结吸收输入。禁止推到 `origin`：[`build.yml`](../.github/workflows/build.yml) 会把 `refs/tags/v*` 当成产品发版 |
| `hanakde-includes-vX.Y.Z` | `origin` | 证明该上游 tag 已成为 `hanakde` 祖先 |
| 产品发版 `v*` | 仅在准备发布 HanaKDE 时由发版流程创建 | 必须指向 `hanakde` 上的产品提交，不得复用上游同名 tag |

误把上游 `v0.447.4` 推到 `origin` 会触发失败的产品 Build。镜像 workflow 使用 `--no-tags`。

## CI 与保护

- CI 监听 `hanakde` 的 push 和 PR，见 [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)。
- `hanakde`：需要 PR、必需检查，禁止删除和 force-push。
- `main`：禁止删除和 force-push，但允许镜像 job 做 fast-forward。上游历史改写时 fail closed，不自动 force-push。

## 清理时点

- feature / sync 分支：PR 合入且无开放引用后删除本地与 `origin` 同名分支。
- Worktree：Ticket 完成后 `git worktree remove`；detached 旁支若仍有独特内容，先打本地救援 tag 再删。
- 仓库级 stash 与当前未提交工作区改动不纳入分支治理提交。
