# OpenHanako Knowledge Workspace release-validation handoff

## Scope and current decision

Continue the implementation and release audit defined by:

- `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/goal-plan.md`
- `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/spec.md`
- `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/rules.md`
- `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/release-checklist.md`
- `speculo/.speculo/specdev/changes/2026-07-24-openhanako-knowledge-workspace/release-evidence.md`

Credential persistence is settled and must remain unchanged: HanaKDE uses its
existing `HANA_HOME` managed files. Do not add macOS Keychain, `keytar`,
`password-store`, or another operating-system credential store. Local account
passwords persist only as their existing scrypt hash/salt record; provider and
device credentials retain their existing managed-file lifecycles.

The user explicitly prohibited running E2E/Playwright tests. Do not run a
local E2E command unless that instruction changes.

## Current worktree

- Branch: `codex/openhanako-knowledge-workspace-completion`
- Pushed HEAD: `132ed95de87f61983af0e32a09744adf0d815957`
- Draft PR: `https://github.com/NAMEWTA/HanaKDE/pull/1`
- The worktree contains substantial uncommitted Knowledge Workspace changes.
  Preserve all user changes; do not use destructive Git operations.
- The implementation has not been committed or pushed during the current
  release-validation pass.

The active objective was marked blocked, rather than completed, because the
plan's release Definition of Done requires current-head E2E and three-platform
CI evidence while the user prohibits E2E. Resume the objective only after that
restriction changes or a separately authorized external CI path is available.

## Verified current-state results

These commands completed against the current worktree without running
Playwright specs:

- Full non-E2E Vitest run, explicitly excluding
  `tests/knowledge-workspace-e2e/**`.
- `npm run typecheck`
- `npm run lint:boundary`
- `git diff --check`
- `npm exec vitest run tests/windows-electron-cdp.test.ts tests/knowledge-baseline-contract.test.ts tests/build-server-artifact.test.ts --maxWorkers=4 --reporter=dot`
  - 3 files, 55 tests passed.
- `npm exec vitest run tests/knowledge-release-evidence.test.ts tests/merge-audit.test.ts tests/open-boundary-lint.test.ts tests/server-composition-boundary.test.ts tests/persistence-schema-tripwire.test.ts --maxWorkers=4 --reporter=dot`
  - 5 files, 43 tests passed.

The change inventory is structurally complete: 57 ticket files, 193 unique
`KW-US-*` entries in `requirements-traceability.md`, and 24 fixed `E2E-KW-*`
spec IDs exist. This proves the implementation inventory, not the required
release E2E evidence.

## Windows fixes awaiting release evidence

### Windows general test

The latest pushed Windows general test failed only because
`tests/merge-audit.test.ts` exceeded the global 10-second Vitest timeout while
creating several real Git repositories under full-suite Windows load. The
current worktree already contains the scoped 30-second suite timeout in that
file. This is a bounded integration-test allowance; it does not change product
behavior or the global timeout.

### Windows Desktop E2E

The prior Windows Desktop failure is the Playwright Electron startup cycle:
Electron published its Node inspector endpoint but did not relay Chromium's
DevTools banner through stdio. The replacement is currently uncommitted:

- `tests/knowledge-workspace-e2e/fixtures/windows-electron-cdp.ts`
- `tests/knowledge-workspace-e2e/fixtures/electron-main-process-application.ts`
- `tests/windows-electron-cdp.test.ts`
- `tests/knowledge-workspace-e2e/fixtures/app-fixture.ts`
- `tests/knowledge-workspace-e2e/fixtures/server-fixture.ts`
- `tests/knowledge-workspace-e2e/fixtures/native-fixture.ts`
- `tests/knowledge-workspace-e2e/specs/E2E-KW-014-024-resource-operations.spec.ts`
- `tests/knowledge-baseline-contract.test.ts`

The direct-CDP fixture spawns Electron with loopback-only Node Inspector and
Chromium endpoints, validates the Node endpoint with the child PID plus a
random launch token, plants a renderer sentinel through the verified main
process, then accepts only the renderer that presents that sentinel. It exposes
the minimal Electron application surface used by the specs: `evaluate`,
`process`, `windows`, and `waitForEvent("window")`. E2E-KW-024 subscribes to
the second-window event before creating the second `BrowserWindow` and closes
that window through the main process.

Static review and the non-E2E contract/unit tests above passed. Do not claim
the Windows desktop workflow is fixed until an authorized CI run validates it.

## Release evidence integrity

`release-evidence.md`, `goal-plan.md`, the Ticket 57 document, and related
status files contain pre-existing completion claims. The newer
`2026-08-08` section in `release-evidence.md` accurately records the current
non-E2E verification and says that it is not a release closure. Preserve that
distinction. Do not rewrite unexecuted E2E or CI into passing evidence.

Remote PR evidence for pushed HEAD `132ed95d` has 12 successful checks and two
failures:

1. `test (windows-latest, 24.15.0)` -- the merge-audit timeout described above.
2. `knowledge-workspace-e2e (windows-latest, desktop-full)` -- the Electron
   stdio/CDP startup issue described above.

## Authorized next steps when the restriction changes

1. Reinspect the uncommitted diff and keep only the intended Windows
   merge-audit and Direct-CDP changes. Do not overwrite unrelated worktree
   changes.
2. Run the relevant non-E2E checks again, then commit and push only with
   explicit authorization.
3. Let a new three-platform CI matrix run. This necessarily executes the
   project-owned E2E jobs, so it requires the user's approval to supersede the
   current prohibition.
4. After an all-green current code commit, update only the release documents
   with actual commit IDs, CI URLs, and commands. Then push the evidence commit
   and verify its own matrix before changing the PR out of draft state.

## Suggested skills

- `feature-placement`: use only if a new product capability or architecture
  change is proposed; the existing Knowledge Workspace core placement remains
  settled.
- `browser:control-in-app-browser`: use only if GitHub CI or PR state cannot
  be obtained through `gh`.
