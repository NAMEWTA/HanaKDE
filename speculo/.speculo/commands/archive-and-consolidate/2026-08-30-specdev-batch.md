# Archive and Consolidate Dry-Run Plan

> Generated: 2026-08-30 10:15 +08:00
> Workflow: `specdev`
> Mode: `executed`
> Scope: `archive-batch`
> Changes: 3 explicitly selected changes

## Preflight

| Check | Result |
|---|---|
| Workspace and project config | initialized |
| Runtime migration state | absent; no pending migration |
| Change names / source paths | valid / present |
| Archive targets | all absent |
| Change completion | 3 `completed`; 0 blockers; 0 deviations |
| Global index | each change appears once in `active`, zero times in `archived` |
| External reconcile | 3 `not-applicable` |
| Complete-stage validation | each change: 0 errors, 0 warnings |
| Workflow self-check | 0 errors, 0 warnings |
| Git ancestry | `0e6bfc40`, `24705bb2`, and `b0c74282` are ancestors of current `hanakde` |

Before this dry-run, the implementation owner repaired stale SpecDev completion artifacts: Ticket/Map/worktree status, current Evidence structure, missing triage intake gates, and the missing macOS conversation source. No product code or Git history was changed.

## Phase 1: Archive Moves

| # | Source | Target | Action | Risk | Status |
|---|---|---|---|---|---|
| 1 | `<Path>{roots.state}/specdev/changes/2026-08-27-macos-release-team-id-crash/</Path>` | `<Path>{roots.state}/specdev/archive/2026-08/2026-08-27-macos-release-team-id-crash/</Path>` | atomic move; archive status and global index update | medium, destructive move | moved |
| 2 | `<Path>{roots.state}/specdev/changes/2026-08-28-knowledge-explorer-convergence/</Path>` | `<Path>{roots.state}/specdev/archive/2026-08/2026-08-28-knowledge-explorer-convergence/</Path>` | atomic move; archive status and global index update | medium, destructive move | moved |
| 3 | `<Path>{roots.state}/specdev/changes/2026-08-29-todolist-backend-reliability/</Path>` | `<Path>{roots.state}/specdev/archive/2026-08/2026-08-29-todolist-backend-reliability/</Path>` | atomic move; archive status and global index update | medium, destructive move | moved |

The batch is atomic at preflight: any source/target/status drift blocks all three moves.

## Phase 1: Knowledge Consolidation

Declared permanent stores scanned: `adr/` (29 files), `context/` (3 files), and `research/` (7 files).

### Create ADR-0030

- **Target:** `<Path>{roots.state}/specdev/adr/0030-retire-rejected-workbench-plugins.md</Path>`
- **Source:** `2026-08-28-knowledge-explorer-convergence`
- **Action:** create.
- **Decision:** Finance Workbench and Markdown WeChat are retired from the bundled/runtime product; shared Knowledge/Todo owners remain, and restoring either retired workbench requires a new explicit product and safety decision.
- **Graduation:** stable mechanism + must-know. The removal is hard to reverse, surprising relative to the immediately preceding releases, and trades product breadth for one supported owner per workflow.
- **Risk:** medium; permanent architectural truth.

### Create Release Integrity Context

- **Target:** `<Path>{roots.state}/specdev/context/experimental-release-integrity.md</Path>`
- **Source:** `2026-08-27-macos-release-team-id-crash`
- **Action:** create.
- **Terms:** platform release identity, internal artifact cryptographic identity, and untouched-package gate.
- **Graduation:** stable mechanism + must-know. Future packaging changes must not restore Developer ID/Authenticode assumptions to experimental releases or weaken internal seed verification.
- **Risk:** low; additive terminology.

### Ephemeral

| Change | Knowledge | Reason to keep only in archive |
|---|---|---|
| macOS release crash | command transcripts, ARM64 local receipt, CI repair sequence | incident/release-specific execution history |
| Knowledge convergence | fixed-point file ledger and individual deleted component list | one-time convergence details; current owner decision is captured by ADR-0030 |
| Todo reliability | handler line placement, CSS measurements, CRUD test item lifecycle | implementation and verification detail already protected by code/tests |

No permanent `research/` write is planned.

## Phase 2: Cleanup Candidates

| # | Path | Classification | Planned action | Evidence / rationale | Risk |
|---|---|---|---|---|---|
| 1 | `<Path>{roots.state}/specdev/adr/0027-financial-source-policy-and-run-provenance.md</Path>` | needs-confirmation | add `Superseded by ADR-0030` header; retain history | current product has no Finance Workbench runtime; ADR is less than 30 days old and must not be deleted | medium |
| 2 | `<Path>{roots.state}/specdev/adr/0029-finance-research-only-consent-boundary.md</Path>` | needs-confirmation | add `Superseded by ADR-0030` header; retain history | current product has no Finance Workbench runtime; ADR is less than 30 days old and must not be deleted | medium |
| 3 | `<Path>{roots.state}/specdev/context/finance-workbench.md</Path>` | delete | delete after ADR-0030 is written | all seven terms describe a retired implementation; live code has no positive consumer, while history remains in archive | medium, destructive delete |
| 4 | remaining 27 ADR, 2 context, and 7 research files | keep | none | current, recently promoted, or still referenced; no duplicate or malformed entry found | none |

`ADR-0028` remains current because Host-owned iframe capability dispatch applies beyond the retired Markdown WeChat implementation.

## Conflicts And Recommendation

The permanent store currently presents Finance Workbench as active while source code, negative inventory tests, and release digest state it is retired. Recommended resolution: create ADR-0030, mark ADR-0027/0029 superseded, and delete `context/finance-workbench.md`. This preserves history without leaving stale current terminology.

## Execution Order After Approval

1. Revalidate paths, status, targets, Git ancestry, and permanent-store drift.
2. Atomically move all three change directories and update archived `.status.json` plus global `status.json`.
3. Create ADR-0030 and `context/experimental-release-integrity.md` with source pointers to the new archive paths.
4. Add superseded pointers to ADR-0027/0029, then delete `context/finance-workbench.md`.
5. Re-read all sources/targets/index/stores; run structural validation, workflow self-check, and `git diff --check`.
6. Append the executed results and verification verdict to this report.

## Summary

| Item | Count |
|---|---:|
| archive moves | 3 |
| knowledge creates | 2 |
| cleanup rewrites | 2 |
| cleanup deletes | 1 |
| unchanged permanent knowledge files | 36 |
| items requiring explicit approval | 8 |

## Approval And Execution

The user explicitly approved this exact persisted plan with `执行上述的dry run计划。`. Confirmed execution started at 2026-08-30 10:21 +08:00 after migration, path-containment, source/target, completion, global-index, permanent-store drift, and Git-ancestor checks all passed.

| Planned action | Result |
|---|---|
| three same-volume directory renames | moved; no rollback required |
| archived `.status.json` and global index updates | applied |
| create ADR-0030 | created |
| create `context/experimental-release-integrity.md` | created |
| supersede ADR-0027 and ADR-0029 | applied; both retained |
| delete `context/finance-workbench.md` | deleted; history remains in archive |
| `research/` changes | none, as planned |
| Git commit/push/remote actions | none |

The concurrently created `2026-08-30-entity-dossier-plugin` change was not part of the approved scope. It remains the only active change with `current_work: specdev/grill-with-docs` and was not otherwise modified.

## Post-Execution Verification

| Check | Result |
|---|---|
| active source paths | all absent |
| archive targets | all present and complete: 10 / 13 / 10 files |
| archived status | all `change_status: archived`, `archived: true`, canonical archive path, null `current_work` |
| archive work history | `specdev/archive-and-consolidate` present exactly once per change |
| global index | target active count 0; archived count 1 each; active/archived overlap 0 |
| unrelated active state | entity dossier change preserved |
| permanent stores | 30 ADR, 3 context, 7 research files; approved creates/rewrites/delete observed |
| archived structural validation | each: 0 errors, 1 expected archived-location warning |
| workflow self-check | 0 errors, 0 warnings |
| `git diff --check` | pass |

Pre-move `--stage complete` validation passed for all three changes with 0 errors and 0 warnings. After the correct transition to `archived`, that validator mode reports `complete stage requires change_status=completed`; default archived structural validation passes, so this is an expected stage/state mismatch rather than an archive inconsistency.

Final verdict: `verified`.
