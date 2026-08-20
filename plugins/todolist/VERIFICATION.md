# Verification record

## Executed for this package

```text
npm run typecheck
node --experimental-strip-types --test tests/*.test.ts
node --experimental-strip-types build.ts
node --check assets/page.js
node --experimental-strip-types scripts/verify-package.mjs
```

Latest local result before packaging:

- strict TypeScript: pass
- automated tests: 27/27 pass
- UI asset build: pass
- generated browser JS syntax: pass
- standalone copied-directory smoke: 16 tools and 19 loadable entrypoints pass

The local runner was Node 22 with type stripping; the target branch declares Node `>=24.12.0 <25`. The test source itself has no third-party runtime dependency.

## Covered

- shared Runtime across independent route/tool context objects
- request-scoped principal and capability bus; fail-closed route bus fallback
- `runAt` contract and no `dueAt` scheduling payload
- Reminder duplicate handoff, thrown unschedule failure, and `removed: false` fail-closed cancellation
- Agent Session acceptance vs terminal completion, unrelated Session event isolation, Session-path-scoped abort, and TaskRegistry/Session cancellation confirmation
- optimistic concurrency, idempotency, actor/session/version-bound purge confirmation
- recurrence independent occurrences, stable RuleVersion and idempotent materialization
- persisted import preview, stale revision rejection, atomic/idempotent commit
- v1 migration without schedule/Session reactivation
- atomic store failure recovery
- ResourceRef absolute-path/credential rejection and export privacy
- production Page shell assets/locale/escaping
- public tool catalog without internal state handlers
- lifecycle register/unregister and dynamic invocation descriptors

## Required in the target repository before merge/release

These need the full HanaKDE checkout and running host and therefore are intentionally not represented as locally green:

- PluginManager builtin discovery/load/removal smoke
- real TaskRegistry process/restart integration
- real Session, Agent, ResourceIO and notification capability harness
- full repository typecheck/lint/build/seed regression
- real-host Playwright across five locales, desktop/narrow, keyboard and IME
- path allowlist proving the final repository diff is restricted to `plugins/todolist/`

Do not mark those change gates verified until their exact repository commands and logs are attached to the change evidence.
