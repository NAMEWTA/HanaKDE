---
schema_version: 1
artifact: source
change: 2026-08-25-enable-plugin-surface-downloads
source_type: conversation
canonical_locator: null
captured_at: 2026-08-25T23:29:00+08:00
content_sha256: 1636bce8fd0b08ff74f06be5414267685665d8f6ab73a6012417fe1737ad2650
remote_state: not-applicable
close_capability: not-applicable
---

# Source: Enable plugin surface downloads

## Capture Metadata

- **Capture method:** conversation plus browser runtime verification
- **Author:** user / Lead-discovered implementation prerequisite
- **Created / updated:** 2026-08-25
- **Labels or classification supplied by source:** complete all SpecDev changes; plugin changes remain plugin-only
- **Attachments:** none
- **Redactions:** none

## Original Content

Complete all SpecDev changes. Browser verification proved plugin Page/Widget downloads require the host iframe `allow-downloads` sandbox token; keep the plugin change plugin-only by implementing the capability as a separate system change.

## Source Comments

- The user authorized local implementation and commits needed to complete all changes with default approval.
- The Markdown plugin cannot change the host-created iframe sandbox without violating its plugin-only boundary.
- No remote source needs reconciliation.
