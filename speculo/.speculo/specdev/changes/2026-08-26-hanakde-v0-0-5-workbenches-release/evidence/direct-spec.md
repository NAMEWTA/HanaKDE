# Direct Spec Implementation Evidence

- **Change:** `2026-08-26-hanakde-v0-0-5-workbenches-release`
- **Lead:** `root`
- **Workspace:** current workspace / `hanakde`
- **Implementation baseline:** `befea22f5da9c65509efe95daeeef8d35b115c7b`
- **Status:** clean-checkout packaging repair verified; corrected remote publication pending

## Acceptance Mapping

| Acceptance criterion | Evidence | Result |
| --- | --- | --- |
| Root and lock versions are 0.0.5 | `package.json`, `package-lock.json`, Knowledge preflight regression | pass |
| v1 current digest and v2 history describe the verified v0.0.5 delta | both digest validators and digest regression suite | pass |
| Plugin-private persistence remains under the shared registry contract | scanner: 64 stores / 795 sites; registry and schema tripwire: 32 tests | pass |
| Markdown and Finance workbenches are release-ready | Markdown verify: 23 tests; Finance verify: 25 tests; both package verifiers and builds pass | pass |
| Host capability and plugin-surface behavior remain valid | targeted host matrix: 9 files / 70 tests | pass |
| Repository release gates pass | typecheck; ESLint 0 errors; four package builds; client production build | pass |
| CI-equivalent unit/integration suite passes | main shard: 1225 files / 12312 tests; isolated gates: 83 tests; Todo: 30 tests | pass |
| Clean-checkout server packaging includes plugin workspace runtime | source-mapped typecheck without package `dist`; 63 focused tests; complete signed darwin-arm64 server build; runtime import and seed-kit verification | pass |
| Annotated tag, remote workflow, and 13 release assets | awaiting branch/tag push and GitHub verification | pending |

## Implementation Notes

- Registered Finance and Markdown plugin-scoped writes under the existing `plugin-runtime-data` descriptor; no store model, schema, `DATA_EPOCH`, or runtime capability was added.
- Added the Markdown source-asset build exemption and regenerated the compatible persistence fingerprint `sha256:cf4f9b190d8e71dbc6e324c1635fe16193da3aa4348345521a742386a5e6a4bd`.
- Kept generated plugin bundles out of ESLint source analysis and kept Finance's `node:test` suite out of root Vitest collection; each plugin's own verifier remains authoritative.
- Added the existing asset declaration to the test TypeScript project and advanced the audited package-version contract to 0.0.5.
- Updated the File History release contract so the current v1 digest remains delta-only while v2 retains historical coverage exactly once.
- Repaired the clean-checkout server packaging boundary exposed by the first remote attempt: plugin root `*.config.*` files are excluded from runtime dependency discovery, local `file:` dependencies retain their paths and transitive workspace closure, workspace packages are built and staged, and npm-created links are materialized before the symlink-free signed archive is packed.
- Added source path mappings so root and Markdown typechecks do not depend on stale workspace `dist` output; the stricter Markdown project also exposed and fixed one statically guaranteed SDK route-capture narrowing.

## Verification

- `volta run npm run typecheck`: pass.
- `volta run npm run lint`: pass with 0 errors; 8082 existing warnings remain non-blocking.
- `volta run npm run build:packages`: pass.
- `volta run npm run build:client`: pass.
- `volta run npm --prefix plugins/markdown-wechat run verify`: pass, 23 tests.
- `volta run npm --prefix plugins/finance-workbench run verify`: pass, 25 tests.
- Clean workspace-package-output check (`dist` temporarily absent): root and Markdown typechecks pass.
- Packaging regression suite: pass, 63 tests across dependency discovery, dependency staging/materialization, and signed artifact contracts.
- Expanded release/persistence/build regression suite: pass, 12 files / 145 tests.
- Full `volta run npm run build:server` with an ephemeral matching key/keyset: pass; packaged `@hana/plugin-runtime` import and `verify:seed-kit` pass.
- Release digest v1/v2 validators: pass for `v0.0.5`; persistence scan remains 64 stores / 795 sites.
- CI-equivalent main Vitest shard: pass, 1225 files / 12312 tests / 8 skipped.
- CI isolated gates: pass, 28 + 9 + 13 + 12 + 21 tests; Todo: 30 tests.
- `node speculo/workflows/specdev/common/tools/validate-specdev.mjs --stage implement ...`: pass, 0 errors / 0 warnings before publication.

## Path And Risk Audit

- Release candidate paths are limited to version/digest metadata, persistence governance, release-gate configuration/tests, the regenerated Markdown bundle, and this SpecDev change.
- Untracked `pnpm-lock.yaml` and `pnpm-workspace.yaml` are outside scope and excluded from staging.
- No Apple signing/notarization identity, trading capability, data migration, or third-party publication credential was introduced.
- The first pushed candidate (`5663876d4541aff4f3e25d948d1c8db4341b369f`) reached remote CI but failed on clean-checkout workspace package resolution; Build run `32920794734` failed before release creation. No GitHub Release was published from that candidate. The annotated tag will be moved to the verified repair commit before the corrected build is triggered.
- Remote workflow, release URL, asset inventory, and final release commit will be appended after publication.
