# Hana Dossiers

Hana Dossiers is a full-page, local-first archive plugin. It keeps entity metadata, contacts, managed document copies, recovery records, and portable ZIP exports under the selected workspace's `Dossiers/` directory.

## Use

Open the **Dossiers / 档案** Page and select a workspace directory. The Page creates or opens `Dossiers/`, checks its schema compatibility, and then exposes the catalog, dossier content, and maintenance views. Files selected from outside the managed dossier are copied into it. A file already inside the same managed dossier is recorded as a reference without duplicating its bytes.

Agent tools take an explicit `workspaceMountId`. Read tools return bounded metadata and relative ResourceRefs; they do not send an entire managed document to a model. Workspace writes remain reviewer-bound and model content access can be disabled from the dossier Page.

## Storage

- `Dossiers/manifest.json`: portable library authority.
- `Dossiers/dossiers/<id>/dossier.json`: one dossier authority.
- `Dossiers/dossiers/<id>/documents/<category>/`: managed document bytes.
- `Dossiers/.system/`: journal, recovery, trash, and migration state.
- Plugin `dataDir/index/`: rebuildable SQLite metadata index only.

Removing or disabling the plugin does not remove `Dossiers/`.

## Development

From `plugins/dossiers/`:

```bash
npm run verify
```

`verify` runs strict TypeScript, all application and UI tests, creates the browser bundle, bundles every Node entry into a temporary standalone plugin, copies the native SQLite runtime dependency, and imports that isolated package without relying on repository source paths.

The real-host suite intentionally requires a loaded Hana Page:

```bash
HANA_DOSSIERS_E2E_URL="http://127.0.0.1:<port>/api/plugins/dossiers/page?..." npm run test:e2e
```

Use Hana's plugin dev install/reload diagnostics for source iteration. A production package must contain the prebuilt `assets/page.js`, `assets/page.css`, bundled Node `.js` entries, and the packaged `better-sqlite3` runtime; Hana does not run `npm install` during plugin installation.
