# Direct Spec Implementation Evidence

- **Change:** `2026-08-25-enable-plugin-surface-downloads`
- **Lead:** `root`
- **Workspace:** current workspace / `hanakde`
- **Parent before SHA:** `32b9f14f5d74ba60fed0cf675e4afdef6f6e73cc`
- **Final checkpoint/result SHA:** `908326fabed776ad5bede6e4ac1d2657463fa09d`
- **Implementation commit:** `908326fabed776ad5bede6e4ac1d2657463fa09d`

## Acceptance Mapping

| Acceptance | Evidence | Result |
|---|---|---|
| AC-001 Page sandbox | PluginPageView component assertion | pass |
| AC-002 Widget sandbox | PluginWidgetView component assertion | pass |
| AC-003 iframe regressions | 4 files / 14 Vitest tests | pass |
| AC-004 browser behavior | Playwright Chromium Blob download probe | pass |

## Verification

- `volta run npx vitest run` for Page, Widget, iframe hook and surface URL tests: 4 files, 14 tests passed.
- Chromium probe with `allow-scripts allow-forms allow-popups allow-same-origin`: `downloaded: false`.
- Identical user-click probe with `allow-downloads` appended: `downloaded: true`.
- `git diff --check` passed before commit.

## Boundaries And Review

- Only `<Path>desktop/src/react/components/plugin/</Path>` and matching component tests changed.
- No plugin manifest, SDK, network, filesystem, top-navigation or opener capability changed.
- **Standard axis:** pass; the standard sandbox token is applied to both owning components and directly tested.
- **Conformance axis:** pass; the system change restores the plugin contract without modifying plugin-owned code.
- **E2E disposition:** required/passed through a real Chromium download event probe.
- **Deviations:** none.
- **Residual risk:** browser vendors retain their normal user-activation and download policy; the host does not request bypass of those controls.
- **Re-read:** commit `908326fa` is current `hanakde` history and its four changed files match the Evidence.
