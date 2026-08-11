# Upstream Sync Ledger

本 ledger 是 HanaKDE 对 OpenHanako v0.446.6 target 的 staged sync 记录。它只
记录已经落入本地 integration ancestry 的事实；新的 upstream commit 必须先冻结
来源、计算 overlap，再按本表方法复核，不能把 rerere 或无冲突 merge 当作语义答案。

## Frozen target

- **Repository target:** `openhanako v0.446.6` / package version `0.446.6`
- **Initial freeze:** T-01 `fabe31dd`
- **Current documentation baseline:** T-24 dispatch `de0eb983`
- **Integration branch:** `speculo/2026-08-09-openhanako-v0-446-6-integration/integration`
- **Rule:** final target must remain an ancestor of the final HEAD; patch equivalence is insufficient.

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
