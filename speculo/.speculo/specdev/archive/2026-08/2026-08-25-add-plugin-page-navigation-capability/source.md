---
schema_version: 1
artifact: source
change: 2026-08-25-add-plugin-page-navigation-capability
source_type: conversation
canonical_locator: null
captured_at: 2026-08-25T23:35:00+08:00
content_sha256: 10f3f425268bb8b40d930127360e5e9bf4df1ca0c229242d690f3fd6b361b2a7
remote_state: not-applicable
close_capability: not-applicable
---

# Source: Add bounded plugin Page navigation

## Capture Metadata

- **Capture method:** conversation plus repository contract inspection
- **Author:** user / Lead-discovered implementation prerequisite
- **Created / updated:** 2026-08-25
- **Labels or classification supplied by source:** complete all SpecDev changes; plugin changes remain plugin-only
- **Attachments:** none
- **Redactions:** none

## Original Content

Complete all SpecDev changes while keeping plugin implementations inside their plugin directories. The Markdown Widget needs a supported way to open its own contributed Page; the existing SDK exposes no such bounded operation.

## Source Comments

- The user authorized required local system changes as separate SpecDev changes.
- The capability must bind the caller plugin ID and cannot navigate to another plugin or arbitrary host route.
- No remote source needs reconciliation.
