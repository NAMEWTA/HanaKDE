# Upstream Sync Ledger

本 ledger 是 HanaKDE 对 OpenHanako 的 staged sync 记录。它只
记录已经落入本地 integration ancestry 的事实；新的 upstream commit 必须先冻结
来源、计算 overlap，再按本表方法复核，不能把 rerere 或无冲突 merge 当作语义答案。

## Frozen target

- **Repository target:** `openhanako v0.447.4` / package version `0.447.4`
- **Previous absorbed ancestor:** `v0.446.6` / `5f08a4f30203abb61dafac7dbb7ab92d11c23efa`
- **Initial freeze:** T-01 `fabe31dd`
- **Current documentation baseline:** T-24 dispatch `de0eb983`
- **Visible sync branch (keep):** `speculo/upstream-sync/v0.447.4`
- **Historical integration branch (deleted after v0.446.6):** `speculo/2026-08-09-openhanako-v0-446-6-integration/integration`
- **Rule:** final target must remain an ancestor of the final HEAD; patch equivalence is insufficient. Merge the **named tag**, not a raw SHA, and do not delete the sync branch until Git Graph shows the diamond.

## Checkpoint ledger

| Stage | Fixed checkpoint | Classification | Kept/deleted decision | Verification |
|---|---|---|---|---|
| T-01 baseline | `fabe31dd` | frozen target/authorization | keep target and ownership rules | SpecDev baseline Evidence |
| T-02 | `d7918e3c` | upstream accepted | keep v0.421.24 checkpoint | integrated merge + tests |
| T-03 | `e0511f02` | upstream accepted | keep v0.433.1 checkpoint | integrated merge + tests |
| T-04 | `2ae89bd8` | upstream accepted | keep v0.441.3 checkpoint | integrated merge + tests |
| T-05 | `96d252e6` | upstream accepted | keep v0.441.32 checkpoint | integrated merge + tests |
| T-06 | `22a33e1b` | upstream accepted | keep v0.442.0 checkpoint | integrated merge + tests |
| T-07 | `ea53119d` | upstream accepted | keep v0.443.46 checkpoint | integrated merge + tests |
| T-08 | `893a2984` | upstream accepted | keep v0.443.54/v0.444.1 checkpoints | integrated merge + tests |
| T-09 | `c45d1e54` | target freeze | keep v0.446.6; remove obsolete target alternatives | ancestry and regression Evidence |
| T-10 | `2018ce1d` | HanaKDE semantic integration | keep ResourceIO contracts; delete duplicate kernel paths | persistence/authority census |
| T-11 | `d46d6cdd` | HanaKDE semantic integration | keep single observation owner; delete successor watcher overlap | lifecycle and workspace Evidence |
| T-12--T-14 | `ff0b638f` | HanaKDE semantic integration | keep main-only History, Knowledge repair and separate stores | W4 closure, 14 files/220 tests |
| T-15 | `776b0a68` | HanaKDE security integration | keep fail-closed conditional restore/native proof | 43 focused tests + native smoke |
| T-16 | `c6c0d429` | HanaKDE UI integration | keep main-bound History UI; host mount remains residual | 65 focused tests |
| T-17 | `65699d2b` | HanaKDE projection integration | keep strict Agent envelope; no raw-path fallback | 35 focused tests; producer gap explicit |
| T-18/T-19/T-20 | `271da295` | HanaKDE lifecycle/extraction integration | keep shared Extraction and Office adapter; no second parser | extraction/Office Evidence |
| T-21 | `e1b232b3` | production packaging integration | keep target helper/closure/manifest; no release side effect | clean package/open rehearsal, 48 independent tests |
| T-23 | `7d15baea` | platform harness integration | keep macOS runner; do not promote arm64-only review to done | 20 independent tests plus atomic-event hardening, arm64 DMG inventory |
| T-24 | `de0eb983` | documentation work baseline | this ledger is candidate documentation, not final completion | docs/link/terminology review |
| 2026-08-19 v0.447.4 | `7fffcc71` | upstream accepted + semantic integration | absorb frozen `v0.447.4`; keep HanaKDE ResourceIO/Knowledge/History owners | named-tag `--no-ff` merge |
| 2026-08-20 v0.447.4 closure | `a07c22f4` | semantic integration + generated | restore HanaKDE closure justification; rename AGENTS.md docs; pin preflight to `0.447.4` | full vitest + typecheck + renderer; see review subsection |

## Five-way decision vocabulary

For every future upstream change, classify each path as exactly one of:

1. **upstream accepted:** behavior and ownership match the frozen contracts;
2. **HanaKDE kept:** local security, resource, UI or platform behavior remains the
   authority even if upstream has a similar implementation;
3. **semantic integration:** both sides carry useful behavior and are merged only
   after owner/contract review;
4. **generated:** closure, manifest, seed or receipt output is regenerated from source,
   never hand-edited as a semantic fix;
5. **deleted duplicate:** obsolete watcher, parser, migration or compatibility shell is
   removed after its replacement has an isolated proof.

No sync may add a second watcher, baseline, restore writer, extraction parser, legacy
migration path, OCR path, public workspace id, or raw absolute-root API. Conflicts in
these areas route back to the owning Ticket and require a new Evidence checkpoint.

## Next sync procedure

1. Freeze source commit and record its SHA beside the local target SHA.
2. Generate a path overlap report against the current integration HEAD.
3. Re-run architecture/security ownership scans before applying semantic merges.
4. Apply one staged checkpoint at a time; run affected contract tests and update this
   ledger with the actual merge SHA.
5. Regenerate closure/export/seed receipts from source and compare them deterministically.
6. Keep platform Gate residuals visible; do not waive Windows/macOS blockers because a
   macOS/Linux development build is green.

## 2026-08-12 Knowledge workspace resource convergence

This checkpoint records the source-relative, minimal overlay from
`2026-08-12-knowledge-workspace-resource-convergence`. It does not merge, rebase,
cherry-pick, commit, push, or publish an upstream change.

### Frozen inputs and overlap

- **Frozen upstream target:** `c45d1e544f8f2611f92a459947b6a49e9b91239d`
  (`merge(T-09): accept frozen v0.446.6 target`).
- **Frozen ledger baseline:** `de0eb983c5fe237e1349b82a927050c524129b8f`
  (`dispatch(T-24): start architecture sync ledger`).
- **Frozen local source checkpoint:**
  `af658cbe3a998f5631851a7fba8dc7485a53032c`; the change remains an explicitly
  uncommitted working-tree overlay because commit authorization was not granted.
- **Ancestry:** both frozen upstream checkpoints are ancestors of the local source
  checkpoint.
- **Path census:** `c45d1e54..af658cbe` changes 150 paths under
  `core/`, `lib/`, `server/`, `desktop/`, `shared/`, `tests/`, and `docs/`.
  The current convergence overlay changes 30 tracked paths and adds four isolated
  test paths. The exact overlap is five paths.

| Overlap path | Classification | Decision and retained contract |
|---|---|---|
| `core/engine.ts` | semantic integration | Keep the accepted production coordinator, History, Knowledge index and ResourceIO kernel; bind their public Knowledge facade to the active session work directory, drain the previous facade before switch, and keep mounted `main` free of a second local observer. |
| `desktop/main.cjs` | semantic integration | Keep the accepted Main-process native bridge and one-time grant consumption; add `copyPath` only as a grant-bound Main clipboard action, without returning an absolute path to Renderer. |
| `server/routes/resource-io.ts` | semantic integration | Keep the accepted ResourceIO routes and address DTO; resolve the current public Knowledge owner through the Engine seam instead of a private or route-local owner. |
| `tests/engine-resource-events.test.ts` | semantic integration | Keep the accepted single-observer, History and index contract tests; update mounted-main expectations and add focused owner transition coverage without weakening the coordinator assertions. |
| `tests/knowledge-workspace-route.test.ts` | semantic integration | Keep the accepted route contract and mounted-source coverage; use the public ResourceIO injection seam and isolate native-index-dependent assertions from route composition. |

### Five-way decision record

| Classification | Paths or behavior | Decision |
|---|---|---|
| upstream accepted | Existing `ResourceIO`, `SourceRegistry`, atomic/Trash operation coordinators, Workbench compatibility resolver, Desk file-kind/open helpers, shared `ContextMenu`, and Native Grant lifecycle | Reuse as the owning modules; do not fork providers, parsers, previewers, journals, or action protocols. |
| HanaKDE kept | Source-relative Knowledge addresses, durable operation journal, workspace Trash, session-scoped `main`, mounted-source boundaries, and fail-closed native credential checks | Preserve local security and recovery semantics even when upstream offers a superficially similar path-based action. |
| semantic integration | The five overlap paths above plus the thin Knowledge tree/action adapter and workspace-scoped clipboard slice | Combine accepted upstream owners with the smallest local binding and UI projection needed by the product contract. |
| generated | Renderer build output and native helper output such as `dist-renderer/` and `dist-secure-fs/` | Regenerate from source for verification; exclude them from the semantic source checkpoint. |
| deleted duplicate | The route-local `createSandboxResourceIO` composition and Knowledge-specific file icon/open branching | Remove the duplicate owner and replace file-kind/icon/open behavior with existing Desk/preview/native seams. |

### Owner, security, and affected-test receipt

- The production creation scan leaves the workspace owner in `core/engine.ts` and
  `core/workspace-runtime/production-workspace-runtime.ts`. The other Engine
  `ResourceIO` instances are request-body adapters or per-tool sandbox instances,
  not Knowledge production owners. `server/routes/knowledge-workspace.ts` no longer
  creates a sandbox ResourceIO.
- The active local session directory wins over agent home and authorized folders.
  An explicit unavailable local session directory stays fail closed. An active
  mounted `main` uses the mount provider and does not start an agent-home watcher.
- `copyPath` is issued and consumed with action, owner, window, expiry, version and
  one-time binding. Web Open omits the action. The protected Main-only consume
  endpoint may materialize an absolute path, but Renderer receives only the action
  result and never the path value.
- Focused backend regression: 8 files / 133 tests passed. Focused UI/file-kind/
  preview regression: 8 files / 77 tests passed. Locale parity and Knowledge i18n:
  4 files / 8 tests passed. Native contract/security: 4 files / 12 tests passed.
  The Web Open resource-convergence Playwright flow passed, and the Renderer
  production build and TypeScript checks passed.
- Two native Knowledge index assertions in `tests/engine-resource-events.test.ts`
  remain environment-classified: the current Node 22 process requires ABI 127,
  while the installed `better-sqlite3` binary was built for ABI 137. The binary was
  not rebuilt because doing so would replace the repository's existing Electron/
  Node runtime artifact. All non-native owner/event assertions in that suite pass.
- Change-scoped diff checking is clean. A repository-wide staged diff check still
  reports trailing whitespace in separate archive/handoff artifacts that predate
  and are outside this change; this checkpoint does not rewrite them.
- Final change-focused regression after both review axes: 20 files / 214 tests
  passed; the Web Open Playwright flow, three TypeScript configurations, focused
  ESLint, Renderer production build, and change-scoped whitespace check passed.

**Compatibility conclusion:** the overlay is traversable from the frozen v0.446.6
checkpoint without a second owner, watcher, parser, route kernel, or raw
absolute-path Renderer API. Any future overlap that changes these ownership or
security facts must stop at the affected checkpoint and return to Spec/Grill.

## 2026-08-19 Absorb OpenHanako v0.447.4

This checkpoint merges the frozen named tag `v0.447.4` with `git merge --no-ff`
so Git Graph shows a recent diamond from `upstream/main` / `v0.447.4` into the
HanaKDE line. It does not squash, rebase, or cherry-pick, and it keeps the
named sync branch.

### Frozen inputs and topology

- **Frozen upstream tag:** `v0.447.4` =
  `c6d0405294be67cb134c2758f6472748ee73e2be`.
- **Previous absorbed ancestor:** `v0.446.6` =
  `5f08a4f30203abb61dafac7dbb7ab92d11c23efa`.
- **Local baseline:** `hanakde` =
  `532bb876ef3348137f90376e6212196b03fd5f11`.
- **Sync branch:** `speculo/upstream-sync/v0.447.4`.
- **Merge commit:** `7fffcc71bc07b6a0c14ca1f12b106f1be96f3b23`
  (`merge(upstream): absorb OpenHanako v0.447.4`), parents
  `532bb876` + `c6d04052`.
- **Ancestry commands:**
  - `git merge-base --is-ancestor v0.447.4 HEAD` → 0
  - `git merge-base --is-ancestor 5f08a4f HEAD` → 0
  - `git merge-base hanakde v0.447.4` before merge was `5f08a4f`
  - `git rev-list --left-right --count hanakde...v0.447.4` before merge was `441	7`
- **Upstream commits in this slice:** `a14a13bc`, `61a2a6bf`, `bed24b93`,
  `b3927f07`, `d96b5d67`, `ecc2c055`, `c6d04052`.

### Conflict files and five-way classification

| Path | Classification | Decision |
|---|---|---|
| `core/engine.ts` | semantic integration | Keep HanaKDE `randomUUID` and `runBestEffortStartupStep`; add only `migrateAgentPersonaFileNames` and run it as `agents-md-rename` before agent init. Do not import unused upstream migration helpers. ResourceIO / Knowledge / History owners unchanged. |
| `server/routes/desk.ts` | semantic integration | Keep HanaKDE `discloseNativeDetails` on file-action errors; accept upstream `SAFE_CRON_STORE_ERRORS` / `cronStoreRouteFailure`. |
| `scripts/compute-cli-closure.mjs` | semantic integration | Keep the upstream no-line-number justification style; drop the restored `core/migrate-providers.ts` citation (that module is retired on HanaKDE). Regenerated closure receipt in `9e76e2ce`. |
| `export-manifest.json` | semantic integration | Rename `lib/public-ishiki-templates` → `lib/agents-public-templates`; keep HanaKDE `lib/knowledge-workspace/**` export entries. |
| `build/cli-runtime-closure.json` | generated | Regenerated: 9688 files (source-graph=703, runtime-asset=13, nft-runtime-trace=8972). |
| `build/persistence-schema-fingerprint.json` | generated | Regenerated compatible pin `sha256:375db568da7c8d05b377a818e203725045a78304f2681d06eeceeae528c46905`. |
| `build/persistence-store-inventory.json` | generated | Regenerated: 63 stores, 765 sites. |

### Five-way decision record

| Classification | Paths or behavior | Decision |
|---|---|---|
| upstream accepted | AGENTS.md persona rename, template directory rename, cron-store recovery, Windows stale-seed cleanup, locales/settings copy | Accept as the owning upstream increment. |
| HanaKDE kept | ResourceIO / Knowledge / History / restore owners; engine assembly; native path disclosure on Desk file actions; knowledge-workspace export entries | Preserve local contracts. `core/engine.ts` overlap is a 12-line startup rename, not an owner change. |
| semantic integration | `core/engine.ts`, `server/routes/desk.ts`, `export-manifest.json`, and `scripts/compute-cli-closure.mjs` (HanaKDE-owned justification text with upstream no-line-number style) | Combine accepted upstream behavior with HanaKDE helpers, export surface, and retired-module receipts. |
| generated | closure, persistence fingerprint, persistence inventory | Rebuild from final merged source; do not hand-edit. |
| deleted duplicate | none | Template rename is upstream accepted, not a second-owner deletion. |

### Owner, security, and affected-test receipt

- No second ResourceIO, watcher, History store, Knowledge parser, or restore writer was added.
- Focused overlap tests: 8 files / 185 tests passed
  (`agents-md-startup-migration`, `cron-store`, `desk-route-cron`,
  `persona-source`, `workspace-instruction-files-exclude`,
  `agent-manager-create-defaults`, `first-run-default-workspace`,
  `windows-installer-contract`).
- `git diff --check` on the merge result was clean.

**Compatibility conclusion:** `v0.447.4` is an ancestor of the sync HEAD, and
the recent Git Graph diamond is the named-tag merge `7fffcc71`. Future syncs
must freeze the next tag, merge that tag with `--no-ff` on a kept named
branch, and re-run this overlap/classify/scan/test/record loop. Do not reuse
this SHA as evidence for a later upstream tip.

### 2026-08-20 review, residual fixes, and full verification

Ancestry after the named-tag absorb is intact:

- `git merge-base --is-ancestor v0.447.4 hanakde` → 0
- `git merge-base --is-ancestor v0.447.4 feature/todo-plugin` → 0
- `git rev-list --left-right --count hanakde...upstream/main` → `447  0`
- Relative to pre-merge `532bb876`, no HanaKDE files were deleted.
- Of the 101 upstream-touched files, 98 kept their pre-merge HanaKDE
  deviation unchanged. The remaining three were generated closure, the
  intended `runBestEffortStartupStep` engine adapter, and the closure
  justification text corrected below.

| Follow-up | SHA | Classification | Decision |
|---|---|---|---|
| Restore `default-models.json` justification | `9e76e2ce` | semantic integration + generated | Drop the retired `core/migrate-providers.ts` citation; keep upstream no-line-number style; regenerate `build/cli-runtime-closure.json` (9688 files). |
| Docs persona rename | `8e45771e` | HanaKDE kept | `docs/index.md` is HanaKDE-only; rename `ishiki-templates/` / `public-ishiki-templates/` / `ishiki.example.md`. Legacy `/api/agents/:id/ishiki` aliases remain in `server/routes/agents.ts`. |
| Preflight package identity | `a07c22f4` | HanaKDE kept | Pin `tests/knowledge-preflight.test.ts` and the docs index header to `0.447.4`. |
| Todolist persistence registration | `83bc8acc` on `feature/todo-plugin` | HanaKDE kept + generated | Dedicated `todolist-plugin-store` for `plugin-data/todolist`; carve-out from `plugin-runtime-data`; exemptions for `build.ts` and `scripts/verify-package.mjs`; receipts regenerated to 64 stores / 780 sites, fingerprint `sha256:d60e21c69d5daaf38a57b1bab98d71293dac4c06890107283df95786262717fe`. |
| Todolist JsonValue narrowing | `a73fde9b` on `feature/todo-plugin` | HanaKDE kept | Split null/boolean guards so `tsconfig.node.json` typechecks `plugins/**`. |

#### hanakde (`a07c22f4`)

- Typecheck: `tsc --noEmit` + `tsconfig.node.json` + `tsconfig.test.json` passed.
- Renderer production build: `npm run build:renderer` passed.
- Changed-file ESLint (`scripts/compute-cli-closure.mjs`, `tests/knowledge-preflight.test.ts`): 0 errors.
- Full-tree `eslint .`: 522 errors / 16145 warnings, unchanged from the pre-merge
  baseline character (no-undef / pre-existing `any`); not treated as a merge defect.
- Full vitest excluding leftover `specdev-worktree/` / `speculo/` / `.cursor/`:
  **1204 files / 12299 tests passed**, 1 skipped file / 8 skipped tests.
  Failures compared with `532bb876`:
  - **New, fixed:** `tests/knowledge-preflight.test.ts` still expected `0.446.6` (`a07c22f4`).
  - **Same as `532bb876`, environment:** `tests/knowledge-malicious-workspace.test.ts` (2) and
    `tests/knowledge-query-api.test.ts` (1) return 500/503. Same as the 2026-08-12
    ledger note: Node process vs `better-sqlite3` ABI. Not a merge defect.
  - **Same as `532bb876`, flake:** `FileHistoryModal` deleted-file restore timed out
    under the full suite and passed in isolation.

#### feature/todo-plugin (`a73fde9b`)

- Merged the hanakde follow-ups with `--no-ff`.
- Typecheck (three configs) passed after `a73fde9b`.
- Renderer production build passed.
- `node plugins/todolist/scripts/verify-package.mjs` passed.
- Plugin `node:test` suite: **27/27 passed**.
- Full vitest: **1205 files / 12300 tests passed** (one extra file vs hanakde is
  the persistence tripwire coverage of the new store). Same 3 environment
  Knowledge failures and the FileHistoryModal flake. Four plugin `*.test.ts` /
  `*.spec.ts` files are `node:test` / Playwright, so Vitest reports "No test
  suite found"; they are not Vitest suites.

#### Refs retained for the next sync

- Tag `v0.447.4` (upstream freeze)
- Tag `hanakde-includes-v0.447.4`
- Tag `todo-plugin-includes-v0.447.4` on `feature/todo-plugin`
- Branch `speculo/upstream-sync/v0.447.4`
- Remote `upstream` → `https://github.com/liliMozi/openhanako.git`

Do not delete the named sync branch. The next absorb must freeze the next
named tag, merge it with `--no-ff` onto `hanakde`, classify overlap with this
vocabulary, regenerate receipts from source, and rerun the full verification
loop.
