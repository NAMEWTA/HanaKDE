# Changelog

## 0.2.1 — 2026-08-24

### Page runtime

- Use the official Hana plugin SDK for iframe readiness, resize, Resource Picker, and authenticated API requests.
- Signal readiness as soon as the page shell renders, while keeping data-loading errors visible inside the plugin.
- Fail the UI build when the SDK toolchain is unavailable instead of emitting an unauthenticated fallback bundle.

## 0.2.0 — 2026-08-14

### Architecture

- Replaced invocation-context WeakMap state with one lifecycle runtime per resolved plugin `dataDir`.
- Split domain, application, infrastructure, interfaces, UI, routes, and tools.
- Added Store v2 with atomic rename, serialized transactions, backup, v1 migration, revision checks, idempotency, audit, confirmations, outbox, and persisted import previews.

### Host contracts

- Uses request-scoped principal/capability context for HTTP side effects.
- Uses TaskRegistry `runAt`; no interval scanner.
- Added bounded lifecycle handler readiness and deterministic unregister.
- Removed user-callable `wake`, `set_state`, and cancellation-confirmation backdoors.
- Added host-confirmed Reminder/Run cancellation and Session-terminal Run completion; `removed: false` and missing Session paths now fail closed.
- Persists only opaque ResourceRef values, never materialized absolute workspaces.

### Product

- Added manual capture, projects, filters/search, complete/reopen, Trash/restore/purge confirmation, Review, Calendar projection, Reminder, Agent automation, recurrence, and JSON exchange.
- Added five locales and responsive Hana-token CSS.
- Production Page now loads host/plugin CSS and ships prebuilt browser assets.

### Verification

- Added contract, application, recurrence, exchange, migration, fault-injection, privacy, and standalone package-load tests.
