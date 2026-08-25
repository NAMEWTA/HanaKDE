# Direct Spec Implementation Evidence

- **Change:** `2026-08-25-hanakde-v0-0-3-brand-release`
- **Lead:** `root`
- **Workspace:** isolated release workspace on branch `codex/v0.0.3-hanakde`, removed after verified integration under explicit authorization
- **Parent before SHA:** `8044b76affa2f77cd250dbfc9a88f938bde8ca6d`
- **Final checkpoint/result SHA:** `6c50e42992cb3483bacd1c3f5963e17e45649e6b`
- **Tag:** annotated `v0.0.3`, peeled to the final checkpoint and present on origin
- **Feature placement:** HanaKDE system/build/release infrastructure; product identity, Electron bootstrap, packaging, CI and release are outside plugin contribution surfaces

## Implementation Summary

The release repaired Electron runtime preflight and actionable `npm ci` recovery, renamed user-visible and packaged product surfaces to HanaKDE, removed the upstream Apple notarization identity path, retained compatibility identifiers and local integrity signing, and published cross-platform v0.0.3 artifacts. The change spans system-owned build, desktop, CLI, shared, server, documentation and test surfaces; no plugin-only feature was moved into core.

The temporary release workspace `/tmp/hanakde-v003.ITTUCf` and branch `codex/v0.0.3-hanakde` were removed after integration under the recorded cleanup authorization. This Direct Spec does not use Ticket workspace records, so that release-workspace history is recorded here rather than in `.status.json.worktrees`.

## Acceptance Mapping

| Acceptance | Evidence | Result |
|---|---|---|
| Electron install/preflight and actionable recovery | `volta run npm ci`; `tests/electron-runtime-preflight.test.ts`; `volta run npm run start:dev` reached server ready and loaded the main window | pass |
| HanaKDE product and artifact naming | release digest/name guards, package/build configuration and 13 published assets contain HanaKDE/HanaKDE-Core naming | pass |
| Apple notarization identity removed | `afterSign`, `scripts/notarize.cjs`, Apple credential variables and `SKIP_NOTARIZE` removed; CI signing guards passed | pass |
| Compatibility identifiers retained | `com.hanako.app`, data roots, `HANA_HOME`, `hana` CLI and `@hana/*` retained; `hanakde` CLI alias added | pass |
| Tag and Release published | local/origin annotated `v0.0.3` peel to `6c50e429`; workflow `32804155733` completed successfully for that SHA; non-draft prerelease has 13 assets | pass |

## Verification

| Command/gate | Environment | Result |
|---|---|---|
| `volta run npm ci` | Node 24 isolated and primary workspaces | pass; Electron `path.txt` restored and 49 production dependencies validated |
| `volta run npm run typecheck` | isolated release workspace | pass |
| `volta run npm test` | isolated release workspace | pass; 1,220 files, 12,369 tests, platform skips only |
| `volta run npm run build:client` | isolated release workspace | pass |
| `volta run npm run start:dev` | isolated release workspace | pass; Electron preflight, server ready and main window load observed, then process stopped |
| Release digest v1/v2, persistence tripwire, signing boundary, asset-name guards, `git diff --check` | isolated release workspace | pass |
| GitHub Actions run `32804155733` | GitHub, head SHA `6c50e429` | completed/success |
| GitHub Release `v0.0.3` | GitHub | non-draft prerelease, 13 assets |

## Review, Deviations And Risk

- **Standard axis:** pass; runtime preflight fails before renderer work and gives the supported recovery command, while signing changes preserve local integrity and Electron entitlements.
- **Conformance axis:** pass; product identity changed only where specified, compatibility identifiers were retained, and unrelated Todo/Finance work was excluded from the release commit.
- **E2E disposition:** required/passed through `start:dev` smoke plus the cross-platform Release workflow; packaging matrix evidence is owned by the successful remote workflow.
- **Unverified items:** none required by the Direct Spec.
- **Deviations:** none.
- **Residual risk:** macOS artifacts are intentionally not Developer ID notarized; this is the approved release boundary rather than a verification gap.
- **Re-read:** `6c50e429` is contained by current `hanakde` and `origin/hanakde`; the `v0.0.3` tag and successful workflow point to the same commit.
