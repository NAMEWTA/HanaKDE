# Markdown WeChat

Builtin Hana plugin for editing one private Markdown draft, previewing WeChat-safe HTML, importing and explicitly writing ResourceRefs, browser clipboard/download delivery, and Agent HTML SessionFile output.

## Boundaries

- The versioned draft lives only in the plugin `dataDir`.
- Page is the only editor. Widget reads the same draft and offers browser downloads.
- Workspace content is accessed only through ResourceIO and optimistic version checks.
- Page and Widget never create SessionFiles. The Agent `render` tool creates one only when a session is available.
- External media and links are non-navigating placeholders. The plugin declares no network access.

## Verification

Run from this directory:

```sh
npm run typecheck
npm test
npm run build
npm run verify
```

The package verifier fails when required routes, assets, tools, scenarios, or focused test files are absent. Plugin Dev diagnostics are available at `/api/diagnostics`; the manifest includes workbench and tool scenarios.

## Removal

The plugin has no imports from Hana core into its product code and no root registration. Removing this directory removes the feature. Existing plugin-private draft data may be deleted separately by the host's plugin-data cleanup; workspace resources and already registered SessionFiles remain host-owned.
