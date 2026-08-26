# Direct Spec Implementation Evidence

- **Change:** `2026-08-26-hanakde-v0-0-6-maintenance-release`
- **Lead:** `root`
- **Workspace:** current workspace / `hanakde`
- **Implementation baseline:** `6e596762e92e3e253c52f469494c438b902e4995`
- **Status:** local release candidate verified; commit, push, tag, and remote release pending

## Acceptance Mapping

| Acceptance criterion | Evidence | Result |
| --- | --- | --- |
| Root package and npm lock report 0.0.6 | `package.json`, root package-lock package, Knowledge preflight contract | pass |
| v1 marks no user-facing changes and v2 preserves descending history | both digest validators; schema/history tests | pass |
| Existing static and build gates remain valid | workspace package build, typecheck, lint, client production build | pass |
| Annotated tag and 13-asset GitHub prerelease | remote Build and Release inspection | pending |
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

## Path And Risk Audit

- Writable release scope is limited to root version/lock metadata, v1/v2 digests, the version preflight assertion, and this SpecDev change.
- Untracked `pnpm-lock.yaml` and `pnpm-workspace.yaml` remain excluded because the latter contains unresolved build-policy placeholders and conflicts with the authoritative npm workflow.
- Remote tag, Build workflow, and Release remain pending and will be recorded after publication.
