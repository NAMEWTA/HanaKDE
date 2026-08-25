---
schema_version: 1
artifact: triage
change: 2026-08-25-enable-plugin-surface-downloads
mode: intake
source: <Path>{roots.state}/specdev/changes/2026-08-25-enable-plugin-surface-downloads/source.md</Path>
classification: bug
risk: medium
route: specdev/spec
ready_for_implementation: true
external_action: not-applicable
updated_at: 2026-08-25T23:31:09+08:00
---

# Triage: Enable plugin surface downloads

## 当前判定

- **Impact:** restores the browser artifact delivery promised by plugin Page and Widget surfaces.
- **Urgency:** immediate because it blocks the active Markdown plugin acceptance contract.
- **Evidence:** Chromium reproduced `downloaded: false` with the existing sandbox and `downloaded: true` after adding `allow-downloads`.
- **Placement:** system core under `<Path>desktop/</Path>`; the plugin cannot own its embedding iframe.

## 未知项

None. The standard token behavior and the exact host creation points are verified.

## 路由

Direct Spec implementation is complete and ready for archive after local completion validation.

## 外部动作

No remote issue, PR, deployment or production action is required.
