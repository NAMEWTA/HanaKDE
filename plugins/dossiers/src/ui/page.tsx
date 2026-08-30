import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import * as HanaComponents from "@hana/plugin-components";
import { hana } from "@hana/plugin-sdk";

import { CatalogFeature } from "./catalog/index.tsx";
import type { CatalogDossier } from "./catalog/types.ts";
import { DossiersBrowserApi, normalizeWorkspaceRef, workspaceLabel, type WorkspaceRef } from "./browser-app.ts";
import { DossierOperations, MaintenanceView } from "./operations/index.tsx";
import "../../assets/page-source.css";

const WORKSPACE_KEY = "hana.dossiers.workspace.v1";
type View = "catalog" | "operations" | "maintenance";
const HanaThemeProvider = (HanaComponents as unknown as { HanaThemeProvider: React.ComponentType<React.PropsWithChildren<{ mode: "inherit" }>> }).HanaThemeProvider;

function storedWorkspace(): WorkspaceRef | null {
  try { return normalizeWorkspaceRef(JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? "null")); }
  catch { return null; }
}

function DossiersPage(): React.ReactElement {
  const [workspace, setWorkspace] = useState<WorkspaceRef | null>(() => storedWorkspace());
  const [workspaceState, setWorkspaceState] = useState<"select" | "opening" | "ready" | "blocked" | "error">(workspace ? "opening" : "select");
  const [workspaceError, setWorkspaceError] = useState("");
  const [view, setView] = useState<View>("catalog");
  const [selected, setSelected] = useState<CatalogDossier | null>(null);

  const onDossier = useCallback((dossier: CatalogDossier) => setSelected(dossier), []);
  const api = useMemo(() => workspace ? new DossiersBrowserApi(hana, workspace, onDossier) : null, [workspace, onDossier]);
  const catalogClient = useMemo(() => api?.catalogClient() ?? null, [api]);
  const operationsClient = useMemo(() => api?.operationsClient() ?? null, [api]);

  useEffect(() => {
    if (!api) return;
    let active = true;
    setWorkspaceState("opening");
    setWorkspaceError("");
    void api.openWorkspace().then(({ compatibility }) => {
      if (!active) return;
      if (compatibility.state === "ready") setWorkspaceState("ready");
      else { setWorkspaceState("blocked"); setView("maintenance"); }
    }).catch((error: unknown) => {
      if (!active) return;
      setWorkspaceState("error");
      setWorkspaceError(error instanceof Error ? error.message : "无法打开工作区");
    });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    hana.ready();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => hana.ui.resize({ height: document.documentElement.scrollHeight }));
    observer?.observe(document.documentElement);
    return () => observer?.disconnect();
  }, []);

  async function chooseWorkspace(): Promise<void> {
    setWorkspaceError("");
    try {
      const result = await hana.resources.pick({ mode: "directory", multiple: false, capability: "resource.write" });
      const ref = normalizeWorkspaceRef(result.resources[0]);
      if (!ref) return;
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(ref));
      setSelected(null);
      setWorkspace(ref);
      setView("catalog");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "无法选择工作区");
    }
  }

  if (!workspace || workspaceState === "select") {
    return <HanaThemeProvider mode="inherit"><main className="dossiers-welcome"><div className="dossiers-mark" aria-hidden="true">D</div><h1>档案</h1><button type="button" className="dossiers-primary" onClick={() => void chooseWorkspace()}>选择工作区</button>{workspaceError && <p role="alert">{workspaceError}</p>}</main></HanaThemeProvider>;
  }

  return (
    <HanaThemeProvider mode="inherit">
      <main className="dossiers-page">
        <header className="dossiers-toolbar">
          <div className="dossiers-brand"><span className="dossiers-mark" aria-hidden="true">D</span><h1>档案</h1></div>
          <nav className="dossiers-view-switch" aria-label="档案视图">
            <button type="button" aria-current={view === "catalog" ? "page" : undefined} onClick={() => setView("catalog")}>目录</button>
            <button type="button" aria-current={view === "operations" ? "page" : undefined} disabled={!selected || workspaceState !== "ready"} onClick={() => setView("operations")}>档案内容</button>
            <button type="button" aria-current={view === "maintenance" ? "page" : undefined} onClick={() => setView("maintenance")}>维护</button>
          </nav>
          <button type="button" className="dossiers-workspace" title="切换工作区" onClick={() => void chooseWorkspace()}><span aria-hidden="true">⌂</span><span>{workspaceLabel(workspace)}</span></button>
        </header>
        {selected && <div className="dossiers-context"><span>当前档案</span><strong>{selected.name}</strong></div>}
        {workspaceState === "opening" && <div className="dossiers-page-state" role="status">正在打开档案库</div>}
        {workspaceState === "error" && <div className="dossiers-page-state is-error" role="alert"><strong>{workspaceError}</strong><button type="button" onClick={() => void chooseWorkspace()}>重新选择</button></div>}
        {catalogClient && workspaceState === "ready" && view === "catalog" && <CatalogFeature client={catalogClient} />}
        {operationsClient && workspaceState === "ready" && view === "operations" && selected && <DossierOperations key={selected.id} dossierId={selected.id} client={operationsClient} />}
        {operationsClient && (workspaceState === "ready" || workspaceState === "blocked") && view === "maintenance" && <MaintenanceView client={operationsClient} dossierId={selected?.id} dossierName={selected?.name} />}
      </main>
    </HanaThemeProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Dossiers root element is missing");
createRoot(root).render(<DossiersPage />);

export { DossiersPage };
