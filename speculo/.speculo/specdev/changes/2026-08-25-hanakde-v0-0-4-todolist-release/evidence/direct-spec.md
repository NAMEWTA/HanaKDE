# Direct Spec Implementation Evidence

- TodoList implementation commit: `0003a6734faddb170a9c06aa8a2fd282cef6becf`.
- Release commit/tag/workflow/release: pending.

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
- Root release validation: local gates passed; GitHub workflow and cross-platform assets pending.

## Persistence Review

- Removed one obsolete build-time fallback `writeFileSync` receipt after Todo builds became fail-closed on the official SDK/esbuild path.
- Classification: compatible. The 64 registered stores, persisted paths, runtime schemas, and `DATA_EPOCH=1` are unchanged.
- Repinned payload fingerprint: `sha256:3d363bc9fe7ad551466645c7168173eccb90b7fdafe491296565e5681e1cb8dc`.

## Boundaries

- No HanaAgent Apple signing or notarization identity is used.
- The local ephemeral seed-signing private key was deleted after verification and is not recoverable or committed.
- Unrelated finance, Knowledge redesign, and pnpm workspace changes are excluded from release commits.
