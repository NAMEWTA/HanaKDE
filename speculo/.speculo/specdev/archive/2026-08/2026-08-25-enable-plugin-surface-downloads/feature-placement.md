# Feature Placement: Plugin surface browser downloads

## Verdict

**System core — `<Path>desktop/</Path>`.**

## Seven-criterion decision

1. **Privileged subsystem:** the sandbox attribute is created by the Hana desktop renderer, outside every plugin directory.
2. **Contract primitive:** Page and Widget iframe policy is a shared host contribution contract consumed by all full-access plugins.
3. **Always-on requirement:** the host must establish the policy before any plugin surface code executes.
4. **Removability:** a plugin cannot be deleted together with this policy because other plugin surfaces use the same host component.
5. **Contribution surface:** no current plugin manifest or SDK capability can add sandbox tokens to the host iframe.
6. **Permission integrity:** letting a plugin mutate its own sandbox would bypass the host boundary; the host must own the token.
7. **Artifact ownership:** browser downloads are user-initiated browser artifacts, but permission to start them belongs to the embedding document.

The implementation remains narrowly scoped to Page/Widget iframe sandbox construction and its component tests. `allow-downloads` does not add top navigation, opener escape, filesystem paths, network access, or download-without-user-activation.
