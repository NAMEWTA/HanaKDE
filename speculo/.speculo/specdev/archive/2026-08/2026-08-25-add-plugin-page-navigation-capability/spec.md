---
schema_version: 3
artifact: spec
change: 2026-08-25-add-plugin-page-navigation-capability
status: ready
ready_for_tickets: false
planning_depth: lite
sources:
  - USER-DECISION:2026-08-25-complete-all-changes-default-approved
  - CODE:<Path>packages/plugin-protocol/src/index.ts</Path>
  - CODE:<Path>packages/plugin-sdk/src/index.ts</Path>
  - CODE:<Path>desktop/src/react/plugin-ui/capabilities.ts</Path>
---

# Spec: Add bounded plugin Page navigation

## Objective

Let a plugin Page or Widget request navigation to that same plugin's contributed Page through a declared, host-validated SDK capability.

## Requirements

1. Protocol and SDK expose `plugin.page.open` / `hana.ui.openPage()`.
2. The bridge ignores caller-supplied identity and binds the active plugin ID.
3. The target must be the caller's own registered Page and the manifest grant must be present.
4. Page and Widget surface slots may invoke the capability.
5. Protocol, SDK and host capability tests cover success and rejection paths.

## Acceptance Criteria

- **AC-001:** the protocol constant and SDK method use the same capability name and empty payload.
- **AC-002:** a granted Page or Widget opens only its own contributed Page.
- **AC-003:** missing grants, invalid payloads, unknown Pages and cross-plugin identity attempts fail closed.
- **AC-004:** existing protocol, SDK, capability and iframe tests remain green.

## Out Of Scope

- Arbitrary host routes, other plugins, external URLs or top-level browser navigation.
- Navigation that bypasses manifest capability grants.
- Markdown-specific UI behavior.
