# Direct Spec Implementation Evidence

- TodoList implementation commit: `0003a6734faddb170a9c06aa8a2fd282cef6becf`.
- Release commit/tag: `e64e45ae0195ab8624fac77b26dc20aff2332711` / `v0.0.4`.
- Successful workflow: `https://github.com/NAMEWTA/HanaKDE/actions/runs/32836866539`.
- Published release: `https://github.com/NAMEWTA/HanaKDE/releases/tag/v0.0.4`.

## Verification

- TodoList `npm run verify`: passed, 30/30 tests and package smoke.
- Host iframe contracts: passed, 8/8 tests.
- Real HanaKDE Todo E2E: passed, 12/12 desktop/narrow five-locale tests with no 401/403.
- Root typecheck under Volta Node `24.16.0`: passed.
- Root Vitest under Volta Node `24.16.0`: 1,220 files and 12,369 tests passed; 8 tests skipped by platform conditions, with no failures or unhandled errors.
- Persistence inventory/schema fingerprint focused gates: passed, 35/35 after the compatible repin.
- Release digests v1/v2: validated for `v0.0.4`.
- Client production build: passed.
- Server seed build: passed for `darwin-arm64` with an ephemeral local integrity key; `better-sqlite3`, jieba, anydoc, signed Node, and seed verification smokes passed.
- Packaged Todo: manifest version `0.2.1`; packaged/source `page.js` SHA-256 `33db7facae788f2029e8919a0d94267abf50d20e87ccc1bc417257bfe2e54d96`.
- Root release validation: local gates and GitHub cross-platform workflow passed.

## GitHub Release

- Build workflow completed successfully for renderer, Linux x64, Windows x64, macOS x64, macOS arm64, and release jobs.
- Release is non-draft and prerelease, published at `2026-08-25T10:36:14Z`.
- All 13 required assets are uploaded: macOS arm64/x64 DMG and ZIP, Windows installer and Core archive/manifest, Linux AppImage and DEB, three update metadata files, and the v1 release digest.
- A duplicate same-SHA run (`32836864408`) was cancelled before its platform matrix could race the official Release; the retained run used the same tag commit and completed successfully.

## Persistence Review

- Removed one obsolete build-time fallback `writeFileSync` receipt after Todo builds became fail-closed on the official SDK/esbuild path.
- Classification: compatible. The 64 registered stores, persisted paths, runtime schemas, and `DATA_EPOCH=1` are unchanged.
- Repinned payload fingerprint: `sha256:3d363bc9fe7ad551466645c7168173eccb90b7fdafe491296565e5681e1cb8dc`.

## Boundaries

- No HanaAgent Apple signing or notarization identity is used.
- The local ephemeral seed-signing private key was deleted after verification and is not recoverable or committed.
- Unrelated finance, Knowledge redesign, and pnpm workspace changes are excluded from release commits.
