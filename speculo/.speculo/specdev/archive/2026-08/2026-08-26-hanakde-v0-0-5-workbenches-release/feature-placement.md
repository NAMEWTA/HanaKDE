# Feature Placement: Workbench release integration

## Verdict

**Mixed placement: product behavior remains in the built-in plugins; shared release and persistence governance remains in HanaKDE system core.**

## Seven-criterion decision

1. **Privileged subsystem:** system persistence governance decides whether a production write is registered; hard system boundary.
2. **Contract primitive:** `plugin-runtime-data` is the shared store contract for every plugin-scoped `dataDir`; hard system boundary.
3. **Always-on requirement:** the repository scanner and schema tripwire run independently of plugin activation; hard system boundary.
4. **Removability:** Finance and Markdown rules can disappear with their plugins, but the Registry, scanner, TypeScript projects, lint policy, and release tests remain required by HanaKDE.
5. **Contribution surface:** manifests cannot alter build-time persistence classification, so this cannot be expressed as a plugin contribution.
6. **Permission integrity:** no new runtime permission is needed; the existing host-bound `dataDir` scope remains authoritative.
7. **Artifact ownership:** Finance and Markdown state, exports, UI sources, and bundles remain plugin-owned bytes, while their classification and repository release gates are system governance.

The implementation reuses the existing `plugin-runtime-data` descriptor and adds no second store model, migration or runtime capability. Plugin-source fixes stay under `<Path>plugins/</Path>`; repository-wide persistence, lint, typecheck, digest, and release contracts stay in their existing core owners.
