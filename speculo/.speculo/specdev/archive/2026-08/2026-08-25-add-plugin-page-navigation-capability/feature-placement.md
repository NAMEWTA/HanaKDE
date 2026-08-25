# Feature Placement: Plugin own-Page navigation

## Verdict

**System core — protocol, SDK, PluginManager and desktop capability bridge.**

## Seven-criterion decision

1. The host owns contributed Page discovery and routing.
2. `plugin.page.open` is a shared capability contract, not Markdown domain behavior.
3. Caller identity must be supplied by the host rather than trusted from iframe payload.
4. Other plugins can reuse the primitive without depending on Markdown.
5. A plugin cannot safely mutate the host route or SDK by itself.
6. Capability declaration and grant checks preserve the permission boundary.
7. The operation remains bounded to the calling plugin's own registered Page.

The Markdown plugin only declares and consumes this system capability in its own directory.
