# 知识工作区发布检查

Ticket 57 只汇总已实现证据，不首次实现功能，也不把普通运行结果写入设计 `LOG.md`。

## 1. 文档与 ownership

- [ ] [`README.md`](./README.md) 文档核对清单完成；包内 md 相对链接无断链。
- [ ] [`requirements-traceability.md`](./requirements-traceability.md) 的 193 条 story 均有唯一非 57 Primary owner。
- [ ] 每个 owner ticket 的状态为已完成，ticket 内实际命令和证据已填写。
- [ ] 22 个 `KW-RULE-*` 均有 implementing tickets 和实际证据。
- [ ] 无 wildcard ownership、占位、broken link、依赖环或 map/ticket 差异。

## 2. 真实仓库

- [ ] [`implementation-baseline.md`](./implementation-baseline.md) preflight 项全部当场确认通过。
- [ ] audited commit 仍为当前 HEAD 祖先；基线漂移已经同步审计。
- [ ] SilverBullet 参考与 [`silverbullet-reference-matrix.md`](./silverbullet-reference-matrix.md) 一致；复用处的第三方声明完整。

## 3. Build 与自动化

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run lint:boundary`
- [ ] `npm run build:server:open`
- [ ] `npm run smoke:server:open`
- [ ] `npm run build:preload`
- [ ] `npm run build:renderer`
- [ ] `npm run build:main`
- [ ] `npm run build:server`
- [ ] `npm run test:knowledge:e2e:open`
- [ ] `npm run test:knowledge:e2e:full`
- [ ] `npm run test:knowledge:e2e:desktop`

## 4. E2E 与平台

- [ ] `E2E-KW-001`—`E2E-KW-024` 均有项目/平台结果。
- [ ] Desktop Full、独立 Open、独立 Full、LAN/Mobile contract。
- [ ] macOS、Windows、Linux 文件系统矩阵。
- [ ] 自动化创建两个 Renderer context 验证并发与 native grant 隔离；不验收浮动窗口产品入口。

## 5. 数据与失败

- [ ] expected-version、外部变化、三方冲突。
- [ ] operation journal 幂等、全部 named crash points、rollback failure、RECOVERY_REQUIRED。
- [ ] index schema mismatch、corruption、writer lock、rebuild cancel、generation switch。
- [ ] trash restore、system trash failure、30 天清理。
- [ ] source unavailable、workspace switch、orphan。

## 6. 质量

- [ ] zh-CN、zh-TW、en、ja、ko key completeness 与 UI smoke。
- [ ] keyboard、focus、ARIA、screen reader。
- [ ] light/dark/high contrast/narrow layout。
- [ ] performance absolute + relative budget 原始 JSON。
- [ ] TM-001—TM-020 恶意 workspace 矩阵。
- [ ] 依赖许可证与最终第三方清单。

所有结果写入 `release-evidence.md`；未执行必须保持“未执行”，不能标为通过。
