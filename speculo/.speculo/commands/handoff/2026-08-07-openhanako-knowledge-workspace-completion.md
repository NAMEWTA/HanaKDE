# OpenHanako Knowledge Workspace completion handoff

## Mission and authoritative scope

Continue the full release closure described by:

- `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/goal-plan.md`
- `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/spec.md`
- `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/rules.md`
- `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/release-checklist.md`
- `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/release-evidence.md`

The placement decision is already settled: this is HanaKDE system-core work, not a plugin. Do not merge or release; the authorized endpoint is a ready, fully green PR.

Credential persistence is also settled: preserve HanaKDE's existing `HANA_HOME`-owned file stores. Do not introduce macOS Keychain, `keytar`, `password-store`, or another operating-system credential store. Local account passwords continue to persist only as their existing scrypt hash/salt record; provider and device credentials continue to use their existing managed files. Runtime-only bridge/session tokens are not user passwords and remain governed by their existing lifecycle.

## Git and PR state

- Branch: `codex/openhanako-knowledge-workspace-completion`
- Pushed HEAD: `132ed95de87f61983af0e32a09744adf0d815957`
- Draft PR: https://github.com/NAMEWTA/HanaKDE/pull/1, base `main`
- Latest pushed CI run: https://github.com/NAMEWTA/HanaKDE/actions/runs/31155449655
- The PR remains draft. Mark ready only after the final evidence commit's entire matrix is green. Never merge it.

Relevant recent commits are `132ed95d`, `a9f8db71`, `998ec1bd`, `6f1b8e8a`, and `0a4ecc73`. Use `git show` for their exact diffs rather than restating them here.

## Current blocker

The pushed Windows Desktop fixture still uses Playwright's Electron launcher. On hosted Windows, all 21 applicable Desktop stories timed out at `electron.launch` after Node inspector connected. The raw job log proves every launch printed `Debugger listening on ws://127.0.0.1:...` but never printed Chromium's `DevTools listening` banner. Electron GUI children cannot reliably relay that Chromium banner through Playwright's stdio pipe, so increasing the timeout or retrying is not a fix.

Run `31155449655` has two failures:

- Windows general tests, job `92793838006`; download and inspect this job separately.
- Windows Desktop E2E, job `92793838153`; it is the stdio/CDP startup failure above.

All other jobs in that run passed, including Windows Web Open with the real junction E2E-KW-022 gate, Windows Web Full, macOS/Linux Desktop, Open build smoke, and open-boundary lint.

## Uncommitted Windows Desktop replacement

There is an in-progress direct-CDP replacement in the worktree:

- New: `tests/knowledge-workspace-e2e/fixtures/windows-electron-cdp.ts`
- Modified: `tests/knowledge-workspace-e2e/fixtures/app-fixture.ts`
- Modified: `tests/knowledge-workspace-e2e/fixtures/server-fixture.ts`
- Modified: `tests/knowledge-baseline-contract.test.ts`
- Deleted: `tests/knowledge-workspace-e2e/fixtures/windows-electron-loader.cjs`
- Deleted: `tests/windows-electron-loader.test.ts`

Design intent:

- Spawn the real Electron executable on Windows with fixed loopback-only Node inspector and Chromium CDP ports.
- Poll `/json/list` and `/json/version` directly, connect Renderer control with `chromium.connectOverCDP`, and execute existing Electron main-process callbacks through Node inspector `Runtime.evaluate`.
- Preserve the `ElectronApplication` subset used by E2E: `evaluate`, `process`, `windows`, and `waitForEvent('window')`. This is required by native dialog stubs, shell/clipboard/system-trash tests, and E2E-KW-024's second BrowserWindow.
- `HANA_FORCE_WINDOWS_ELECTRON_CDP=1` allows the same bridge to be exercised locally on macOS.
- Endpoint parsing accepts only `ws://127.0.0.1`; child stdio stays ignored so paths, tokens, and response bodies do not enter failure artifacts.

The latest uncommitted tree passed `npm run typecheck` after replacing the unavailable Playwright `Playwright` export with a minimal `ChromiumCdpConnector` type. The combined targeted Vitest plus forced-CDP Desktop command was interrupted before it produced a result, and no related process remains running. Treat this implementation as unverified until the commands below pass.

## Immediate next actions

1. Review `tests/knowledge-workspace-e2e/fixtures/windows-electron-cdp.ts` closely. In particular verify global WebSocket behavior, inspector response parsing, shutdown ordering, and that `waitForEvent('window')` returns the second page after BrowserWindow creation.
2. Run `npm exec vitest run tests/knowledge-baseline-contract.test.ts tests/build-server-artifact.test.ts --maxWorkers=4 --reporter=dot`.
3. Run `HANA_FORCE_WINDOWS_ELECTRON_CDP=1 npm run test:knowledge:e2e:desktop -- --reporter=dot`. This must produce 21 passed and 3 fixed skips; do not substitute the normal macOS Electron launcher.
4. Run target ESLint, `npm run typecheck`, and `git diff --check`.
5. Inspect Windows general-test job `92793838006` and fix its actual failure if it is not already covered by the uncommitted changes.
6. Stage only the six Windows fixture/contract paths listed above, commit, push, and wait for a new full CI run. Do not rerun a failed old job as release evidence.
7. Keep fixing and pushing until all 14 CI jobs pass, including Windows Desktop's real 21 applicable stories.
8. Only after the first all-green code HEAD, finalize Speculo status, Ticket 57, release checklist/evidence, performance evidence, and then wait for the evidence commit's complete matrix to go green again before marking PR 1 ready.

## Verified evidence already available

- Full repository Vitest at `998ec1bd`: 2,863 suites passed; 10,857 passed, 0 failed, 6 skipped out of 10,863 tests. The final HEAD must be rerun after the CDP fixture is complete.
- Local three-project Knowledge E2E at `a9f8db71`: 38 passed, 34 fixed applicability skips.
- `npm run typecheck`, `npm run lint:boundary`, full lint, packages/preload/main/renderer builds, Open Server build/smoke, and Full Server build passed before the current uncommitted fixture work.
- Full Server signing logs were fixed by `132ed95d` so an override is acknowledged without printing its temporary keyset path. Temporary signing material was removed after the build.
- CLI closure: 9,635 files (`source-graph=655`, `runtime-asset=11`, `nft-runtime-trace=8969`).
- Persistence: 59 stores, 796 sites, compatible fingerprint `sha256:446c76f9524cf1281d60a628041db187d49004bd802575a4a1bcae8ddcb8321e`; `DATA_EPOCH` remains 1.
- Reference performance for product commit `132ed95d`: 12/12 scenarios pass against V1 baseline `9649b752`; raw evidence is `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/evidence/performance/132ed95de87f61983af0e32a09744adf0d815957/darwin-arm64.json`, SHA-256 `a663344328eb425120d76de9cecb5bc64efd8ba936957122f8e7abe218e944cf`.
- The first E2E-KW-022 source-external read was a real security finding and must remain explicitly recorded as fixed, never relabeled flaky.

## Worktree boundaries and preservation rules

Do not stage or revert these user-side changes:

- `.gitignore`
- `eslint.config.js`
- `vitest.config.js`
- `speculo/.speculo/commands/retro/`

The change's status/release documents are already dirty with premature completion claims. Preserve them but do not stage them until current CI and final evidence support every claim:

- `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/.status.json`
- `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/goal-plan.md`
- `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/release-checklist.md`
- `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/release-evidence.md`
- `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/ticket/57-release-knowledge-workspace.md`
- `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/tickets-map.md`

Only `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/evidence/performance/132ed95de87f61983af0e32a09744adf0d815957/` is the current intended raw performance artifact directory. Do not stage the other untracked performance directories. Preserve all existing performance worktrees, performance homes, local E2E artifacts, and downloaded CI logs; do not clean them.

## Final release closure

After code CI is fully green:

- Re-run ownership, requirement traceability, ticket/map, link, release-evidence, closure, persistence, typecheck, lint, builds, full Vitest, and three local E2E projects against the final source.
- Update release evidence with actual final commit IDs and CI run URLs. Preserve the security-discovery history and record only tests that truly ran.
- Stage only the final change documents plus the intended raw performance JSON and `.sha256` receipt.
- Push the evidence commit, wait for the entire final PR HEAD matrix, then change PR 1 from draft to ready using the GitHub API. Do not merge.

## Suggested skills

- `feature-placement`: use only if the Windows fix starts changing public architecture; the existing core-not-plugin verdict should otherwise remain unchanged.
- `browser:control-in-app-browser`: use only if GitHub state cannot be inspected or changed through `gh`; CLI/API is preferable for logs and checks.
