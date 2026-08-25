---
schema_version: 3
artifact: spec
change: 2026-08-25-enable-plugin-surface-downloads
status: ready
ready_for_tickets: false
planning_depth: lite
sources:
  - USER-DECISION:2026-08-25-complete-all-changes-default-approved
  - CODE:<Path>desktop/src/react/components/plugin/PluginPageView.tsx</Path>
  - CODE:<Path>desktop/src/react/components/plugin/PluginWidgetView.tsx</Path>
---

# Spec: Enable plugin Page and Widget downloads

## Objective

Permit a user gesture inside a full-access plugin Page or Widget iframe to download a browser-created artifact while preserving all existing navigation, origin, script and host capability boundaries.

## Requirements

1. Page and Widget iframe sandboxes include the standard `allow-downloads` token.
2. The sandbox does not gain top navigation, opener escape, unsandboxed popups, filesystem paths or download-without-user-activation.
3. Both surface components have regression assertions for the exact sandbox contract.
4. Existing plugin iframe handshake and surface URL tests remain green.
5. A Chromium browser probe demonstrates that the old sandbox blocks a Blob download and the new sandbox permits the same user-click download.

## Acceptance Criteria

- **AC-001:** Plugin Page sandbox contains `allow-downloads` and otherwise retains its existing tokens.
- **AC-002:** Plugin Widget sandbox contains `allow-downloads` and otherwise retains its existing tokens.
- **AC-003:** Component and iframe hook tests pass with no changed handshake or URL behavior.
- **AC-004:** Chromium user-click probe observes a download with the new token and no download without it.

## Out Of Scope

- Preview, chat-card or arbitrary HTML iframes.
- Automatic downloads without a user gesture.
- Plugin network, filesystem, navigation or external-open capabilities.
- Changes inside either product plugin directory.
