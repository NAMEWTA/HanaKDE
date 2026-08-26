# Direct Spec Implementation Evidence

- **Change:** `2026-08-26-hanakde-v0-0-6-maintenance-release`
- **Lead:** `root`
- **Workspace:** current workspace / `hanakde`
- **Implementation baseline:** `6e596762e92e3e253c52f469494c438b902e4995`
- **Status:** completed; candidate committed, pushed, tagged, published, and remotely verified

## Acceptance Mapping

| Acceptance criterion | Evidence | Result |
| --- | --- | --- |
| Root package and npm lock report 0.0.6 | `package.json`, root package-lock package, Knowledge preflight contract | pass |
| v1 marks no user-facing changes and v2 preserves descending history | both digest validators; schema/history tests | pass |
| Existing static and build gates remain valid | workspace package build, typecheck, lint, client production build | pass |
| Annotated tag and 13-asset GitHub prerelease | remote tag, Build workflow, and Release API inspection | pass |
| Invalid pnpm placeholder configuration remains outside release | path and status audit | pass |

## Implementation Notes

- Advanced only the root npm package version and corresponding root lock entry.
- Replaced the current v1 digest with an explicit maintenance entry and prepended it to the v2 rolling history using the repository's append-history tool.
- Updated the audited Knowledge package-version assertion to 0.0.6.
- No product behavior, package dependency, public API, persistence schema, migration, signing boundary, or release workflow was changed.

## Verification

- `volta run npm run build:packages`: pass for all four workspace packages.
- `volta run npm run typecheck`: pass.
- `volta run npm run lint`: pass with 0 errors; 8082 existing warnings remain non-blocking.
- Focused release/version suite: pass, 6 files / 66 tests.
- Release digest v1 and v2 validators: pass for `v0.0.6`; v2 versions are strictly descending from 0.0.6 through 0.0.1.
- `volta run npm run build:client`: pass.
- Speculo workflow self-check: pass, 0 errors / 0 warnings.
- Release Build run [`32939213544`](https://github.com/NAMEWTA/HanaKDE/actions/runs/32939213544), attempt 2: pass across Linux x64, macOS arm64/x64, and Windows x64; release job passed.
- Branch CI run [`32939158586`](https://github.com/NAMEWTA/HanaKDE/actions/runs/32939158586), attempt 2: pass, 16/16 jobs successful.

## Integration And Publication

- Release candidate commit: `be3546d1a8422e3b8c34a0fc79b98db442806d6d` (`release: prepare HanaKDE v0.0.6`).
- `origin/hanakde` was pushed to the release candidate before tagging.
- Annotated tag object `a7997e6f3d9eeff10a1ab1c6b09494e562aea22d` (`v0.0.6`) dereferences locally and remotely to the release candidate commit.
- GitHub Release: [`v0.0.6`](https://github.com/NAMEWTA/HanaKDE/releases/tag/v0.0.6), non-draft prerelease.
- Release inspection confirmed exactly 13 uploaded assets: Linux DEB/AppImage, macOS arm64/x64 DMG/ZIP, Windows installer, Windows Core manifest/archive, `latest-linux.yml`, `latest-mac.yml`, `latest.yml`, and `release-digest.v1.json`.
- Build attempt 1 failed before project build on Windows while repairing the Electron runtime with host exit `3221226505`; failed-only rerun passed the same step and the complete Windows release build.
- CI attempt 1 had the same Windows host exit during standalone-server dependency installation and one Windows E2E service-reset timeout; rerun passed both affected jobs and all 16 CI jobs.

## Path And Risk Audit

- Writable release scope is limited to root version/lock metadata, v1/v2 digests, the version preflight assertion, and this SpecDev change.
- Untracked `pnpm-lock.yaml` and `pnpm-workspace.yaml` remain excluded because the latter contains unresolved build-policy placeholders and conflicts with the authoritative npm workflow.
- The completion evidence/status commit is intentionally after the annotated release tag; the published tag remains fixed at the verified release candidate.
