---
schema_version: 3
artifact: spec
change: 2026-08-26-hanakde-v0-0-6-maintenance-release
status: ready
ready_for_tickets: false
planning_depth: lite
sources:
  - USER-DECISION:2026-08-26-commit-push-release-plus-0.0.1
---

# HanaKDE v0.0.6 Maintenance Release

## Objective

Publish the verified post-v0.0.5 branch state as HanaKDE v0.0.6 through the existing cross-platform prerelease pipeline, without presenting maintenance-only test and workflow records as user-facing product changes.

## Requirements

1. Root package and npm lock versions advance from 0.0.5 to 0.0.6.
2. The v1 digest describes v0.0.6 as having no user-facing changes, zero item counts, and an empty items list; v2 prepends the same entry while preserving older entries exactly once.
3. Existing version, digest, type, build, package, and focused release gates pass before tagging.
4. Commit and push `hanakde`, create and push annotated tag `v0.0.6`, and verify the GitHub Build workflow publishes a non-draft prerelease with exactly 13 expected assets.
5. Existing unsigned/not-notarized early-release policy remains unchanged.

## Acceptance Criteria

- `package.json` and root `package-lock.json` report 0.0.6.
- Both committed digest files validate for `v0.0.6`; v2 keeps strict descending version order.
- The release tag resolves to the verified release commit locally and remotely.
- The Build workflow succeeds on macOS arm64/x64, Windows x64, and Linux x64, then publishes the established asset set.
- Invalid placeholder pnpm configuration is not committed or used by CI.

## Out Of Scope

- New product behavior, public API, persistence schema, migration, or data epoch changes.
- Package-manager migration or dual-lock support.
- Apple Developer ID signing, notarization, Windows Authenticode, or third-party publication credentials.
