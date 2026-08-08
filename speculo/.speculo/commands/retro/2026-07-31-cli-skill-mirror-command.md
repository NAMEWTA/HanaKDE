---
command: retro
mode: issue-retro
scope: cli
workflows: []
changes: []
generated_at: 2026-07-31T00:00:00+08:00
---

# Speculo Retro Report

## 复盘范围
本次并非对既有 command/workflow 使用痛点的被动复盘，而是用户在使用 Speculo 过程中主动提出的一项 **missing-capability**：缺少一个把 `.agents/skills/*` 正本自动镜像为 `.claude/skills/*` 指针的 CLI 命令。触发场景来自当前会话中手动为 `feature-placement` skill 建立「正本 + 指针」双目录布局的操作——该操作纯手工、易出错（会话中曾因工作目录漂移导致误建嵌套目录、多次 mv 失败），应固化为可复用的 speculo CLI 命令。

## 信号来源
- 当前会话：手动创建 `.agents/skills/feature-placement/SKILL.md`（正本）与 `.claude/skills/feature-placement/SKILL.md`（相对路径指针 `../../../.agents/...`）的完整过程。
- 手动操作的脆弱性证据：会话中 `mv`/`rmdir` 因目标目录不存在与 PWD 漂移多次失败，最终靠绝对路径 + `mkdir -p` 修复。
- 现有 skill 布局约定：`.agents/skills/*` 存完整 skill，`.claude/skills/*` 存薄指针，指针用相对路径引用正本 `SKILL.md` 并强调「读取正本后照它执行」。

## 改进提案

### [P-high] feature: 新增 speculo CLI 命令，将 .agents/skills/* 正本镜像为 .claude/skills/* 指针
- **类型**：missing-capability → `enhancement`（仓库无 `feature-request` 标签，用 `enhancement`）
- **根因**：镜像/指针化是确定性的机械操作，目前无工具支撑，只能手工执行，易因路径与目录状态出错。
- **建议改动**：见下方 issue 正文（含命令行为、幂等性、边界处理、验收标准）。
- **受影响资产**：`speculo/` CLI 层、`.agents/skills/*`、`.claude/skills/*`。
- **去重结论**：`gh issue list --repo NAMEWTA/Speculo --search "skill mirror .agents .claude cli"` 与中文检索均无命中，非重复。

## 丢弃与降级项
无。本次仅一条明确的 missing-capability 提案。

## 目标仓库
`NAMEWTA/Speculo`（写死，不可覆盖）

## 用户确认记录
用户于 2026-07-31 对单条 issue 清单回复「确认」，授权向 `NAMEWTA/Speculo` 创建。

## 提交结果
- **#34** — feature: 新增 speculo CLI 命令，将 .agents/skills/* 正本镜像为 .claude/skills/* 指针
  - URL: https://github.com/NAMEWTA/Speculo/issues/34
  - 标签: `enhancement`, `ready-for-agent`
