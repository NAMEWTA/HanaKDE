---
schema_version: 1
artifact: triage
change: 2026-08-25-add-plugin-page-navigation-capability
mode: intake
source: <Path>{roots.state}/specdev/changes/2026-08-25-add-plugin-page-navigation-capability/source.md</Path>
classification: feature
risk: medium
route: specdev/spec
ready_for_implementation: true
external_action: not-applicable
updated_at: 2026-08-25T23:40:00+08:00
---

# Triage: Add bounded plugin Page navigation

## 当前判定

- **Impact:** enables a Widget to enter its own full workbench without legacy or arbitrary route messages.
- **Urgency:** required for the active Markdown release gate.
- **Evidence:** protocol, SDK and host inspection confirmed that no supported own-Page operation existed.
- **Placement:** shared system capability; plugin code only consumes it.

## 未知项

None. The existing capability bridge and contributed Page registry provide the required enforcement points.

## 路由

Direct Spec implementation is complete and ready for archive after validation.

## 外部动作

No remote issue, deployment or production action is required.
