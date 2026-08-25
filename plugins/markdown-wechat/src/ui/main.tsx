import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { hana } from "@hana/plugin-sdk";
import type { ArticleSettings, PrivateEnvelope } from "../contracts.ts";
import { copyMarkdownText, copyRichText } from "../clipboard/index.ts";
import { createDownloadArtifact, downloadArtifact } from "../download/index.ts";
import { createWechatDocument, renderMarkdown } from "../renderer/index.ts";
import { WECHAT_THEMES } from "../theme/themes.ts";

type Surface = "page" | "widget";
type Status = { kind: "idle" | "working" | "success" | "error"; message: string };

interface StateResponse {
  ok: boolean;
  state: PrivateEnvelope;
  summary: { title: string; excerpt: string; characters: number };
  recovery: null | { code: string; message: string };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await hana.api.fetch(path, init);
  const payload = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? `Request failed (${response.status})`);
  return payload;
}

function StatusLine({ status }: { status: Status }): React.ReactElement {
  return (
    <div className={`status-line status-${status.kind}`} role="status" aria-live="polite">
      <span className="status-dot" aria-hidden="true" />
      <span>{status.message || "Ready"}</span>
    </div>
  );
}

function Icon({ name }: { name: "copy" | "download" | "import" | "save" }): React.ReactElement {
  const value = { copy: "C", download: "D", import: "I", save: "S" }[name];
  return <span className="button-icon" aria-hidden="true">{value}</span>;
}

function PageApp(): React.ReactElement {
  const [state, setState] = useState<PrivateEnvelope | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [title, setTitle] = useState("Untitled");
  const [settings, setSettings] = useState<ArticleSettings>({ theme: "editorial", font: "sans", fontSize: 16 });
  const [status, setStatus] = useState<Status>({ kind: "working", message: "Loading draft" });
  const revisionRef = useRef(0);
  const loadedRef = useRef(false);
  const saveSequence = useRef(Promise.resolve());
  const recoveryLocked = Boolean(state && !loadedRef.current);

  const rendered = useMemo(() => renderMarkdown(markdown, settings), [markdown, settings]);

  useEffect(() => {
    hana.ready({ surface: "page", version: 1 });
    void api<StateResponse>("api/state").then((response) => {
      setState(response.state);
      setMarkdown(response.state.markdown);
      setTitle(response.state.title);
      setSettings(response.state.settings);
      revisionRef.current = response.state.revision;
      loadedRef.current = !response.recovery;
      setStatus(response.recovery
        ? { kind: "error", message: `Draft recovery required: ${response.recovery.message}` }
        : { kind: "idle", message: "Draft restored" });
    }).catch((error) => setStatus({ kind: "error", message: `Draft unavailable: ${errorMessage(error)}` }));
  }, []);

  async function resetRecovery(): Promise<void> {
    try {
      if (!window.confirm("Back up the unreadable private draft and start a new document?")) return;
      const response = await api<{ ok: boolean; state: PrivateEnvelope; backupName: string | null }>("api/state/reset", { method: "POST" });
      revisionRef.current = response.state.revision;
      setState(response.state);
      setMarkdown(response.state.markdown);
      setTitle(response.state.title);
      setSettings(response.state.settings);
      loadedRef.current = true;
      setStatus({ kind: "success", message: response.backupName ? "Original draft backed up; new draft ready" : "Draft ready" });
    } catch (error) {
      setStatus({ kind: "error", message: `Recovery reset failed: ${errorMessage(error)}` });
    }
  }

  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = window.setTimeout(() => {
      const snapshot = { markdown, title, settings };
      saveSequence.current = saveSequence.current.then(async () => {
        setStatus({ kind: "working", message: "Saving draft" });
        const response = await api<{ ok: boolean; state: PrivateEnvelope }>("api/state", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...snapshot, dirty: true, expectedRevision: revisionRef.current }),
        });
        revisionRef.current = response.state.revision;
        setState(response.state);
        setStatus({ kind: "success", message: "Draft saved" });
      }).catch((error) => {
        setStatus({ kind: "error", message: `Draft kept in memory: ${errorMessage(error)}` });
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [markdown, title, settings]);

  async function importMarkdown(): Promise<void> {
    try {
      setStatus({ kind: "working", message: "Waiting for resource" });
      const picked = await hana.resources.pick({ mode: "file", multiple: false, capability: "resource.read" } as never) as { resources?: Record<string, unknown>[] };
      const ref = picked.resources?.[0];
      if (!ref) {
        setStatus({ kind: "idle", message: "Import cancelled" });
        return;
      }
      const response = await api<{ ok: boolean; state: PrivateEnvelope; source: { name: string } }>("api/resource/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref, expectedRevision: revisionRef.current }),
      });
      revisionRef.current = response.state.revision;
      setState(response.state);
      setMarkdown(response.state.markdown);
      setTitle(response.state.title);
      setSettings(response.state.settings);
      setStatus({ kind: "success", message: `Imported ${response.source.name}` });
    } catch (error) {
      setStatus({ kind: "error", message: `Import failed; draft unchanged: ${errorMessage(error)}` });
    }
  }

  async function writeBack(): Promise<void> {
    try {
      const picked = await hana.resources.pick({ mode: "file", multiple: false, capability: "resource.write" } as never) as { resources?: Record<string, unknown>[] };
      const ref = picked.resources?.[0];
      if (!ref) {
        setStatus({ kind: "idle", message: "Writeback cancelled" });
        return;
      }
      const prepared = await api<{ ok: boolean; target: { ref: Record<string, unknown>; name: string; version: unknown } }>("api/resource/prepare-write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref }),
      });
      if (!window.confirm(`Replace ${prepared.target.name} with the current Markdown?`)) {
        setStatus({ kind: "idle", message: "Writeback cancelled" });
        return;
      }
      setStatus({ kind: "working", message: "Writing selected resource" });
      await api("api/resource/write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref: prepared.target.ref, expectedVersion: prepared.target.version, markdown }),
      });
      setStatus({ kind: "success", message: `Updated ${prepared.target.name}` });
    } catch (error) {
      setStatus({ kind: "error", message: `Writeback failed; draft and target preserved: ${errorMessage(error)}` });
    }
  }

  async function copyRich(): Promise<void> {
    setStatus({ kind: "working", message: "Writing rich clipboard" });
    const result = await copyRichText(rendered.html, rendered.plainText);
    setStatus(result.ok
      ? { kind: "success", message: `Rich text copied (${result.method})` }
      : { kind: "error", message: `Rich copy failed: ${result.error}. Use source copy or HTML download.` });
  }

  async function copySource(): Promise<void> {
    const result = await copyMarkdownText(markdown, (input) => hana.clipboard.writeText(input));
    setStatus(result.ok
      ? { kind: "success", message: "Markdown source copied" }
      : { kind: "error", message: `Source copy failed: ${result.error}` });
  }

  function download(kind: "markdown" | "html"): void {
    const content = kind === "markdown" ? markdown : createWechatDocument(markdown, settings, title);
    const result = downloadArtifact(createDownloadArtifact(kind, title, content));
    setStatus(result.ok
      ? { kind: "success", message: `Downloaded ${result.filename}` }
      : { kind: "error", message: `Download failed: ${result.error}` });
  }

  if (!state) {
    return <div className="loading-surface"><div className="loading-mark" aria-hidden="true">M</div><StatusLine status={status} /></div>;
  }

  return (
    <div className="app-shell page-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">M</span>
          <div><strong>Markdown WeChat</strong><span>Article workspace</span></div>
        </div>
        <div className="topbar-actions">
          {state && !loadedRef.current ? <button className="button" onClick={() => void resetRecovery()}><Icon name="save" />Back up & reset</button> : null}
          <button className="button" disabled={recoveryLocked} onClick={() => void importMarkdown()}><Icon name="import" />Import</button>
          <button className="button" disabled={recoveryLocked} onClick={() => void writeBack()}><Icon name="save" />Write back</button>
          <button className="button button-primary" disabled={recoveryLocked} onClick={() => void copyRich()}><Icon name="copy" />Copy layout</button>
        </div>
      </header>

      <section className="control-strip" aria-label="Article settings">
        <label className="title-field"><span>Title</span><input disabled={recoveryLocked} value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} /></label>
        <label><span>Theme</span><select disabled={recoveryLocked} value={settings.theme} onChange={(event) => setSettings({ ...settings, theme: event.target.value as ArticleSettings["theme"] })}>{WECHAT_THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.label}</option>)}</select></label>
        <label><span>Typeface</span><select disabled={recoveryLocked} value={settings.font} onChange={(event) => setSettings({ ...settings, font: event.target.value as ArticleSettings["font"] })}><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select></label>
        <label className="size-field"><span>Size {settings.fontSize}px</span><input disabled={recoveryLocked} type="range" min="13" max="22" step="1" value={settings.fontSize} onChange={(event) => setSettings({ ...settings, fontSize: Number(event.target.value) })} /></label>
        <div className="export-menu" aria-label="Export actions">
          <button className="icon-button" disabled={recoveryLocked} title="Copy Markdown source" aria-label="Copy Markdown source" onClick={() => void copySource()}><Icon name="copy" /></button>
          <button className="icon-button" disabled={recoveryLocked} title="Download Markdown" aria-label="Download Markdown" onClick={() => download("markdown")}><span aria-hidden="true">MD</span></button>
          <button className="icon-button" disabled={recoveryLocked} title="Download HTML" aria-label="Download HTML" onClick={() => download("html")}><span aria-hidden="true">H</span></button>
        </div>
      </section>

      <div className="workspace-grid">
        <section className="editor-pane" aria-label="Markdown editor">
          <div className="pane-heading"><div><strong>Markdown</strong><span>{markdown.length.toLocaleString()} characters</span></div><span className="pane-mode">SOURCE</span></div>
          <textarea
            className="markdown-editor"
            aria-label="Markdown source"
            spellCheck="true"
            disabled={recoveryLocked}
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
          />
        </section>
        <section className="preview-pane" aria-label="WeChat preview">
          <div className="pane-heading"><div><strong>WeChat preview</strong><span>{rendered.diagnostics.length ? `${rendered.diagnostics.length} media fallback` : "Safe preview"}</span></div><span className="pane-mode">LIVE</span></div>
          <div className="preview-scroll"><div className="wechat-canvas" dangerouslySetInnerHTML={{ __html: rendered.html }} /></div>
        </section>
      </div>
      <footer className="footerbar"><StatusLine status={status} /><span>Revision {revisionRef.current}</span></footer>
    </div>
  );
}

function WidgetApp(): React.ReactElement {
  const [response, setResponse] = useState<StateResponse | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "working", message: "Loading article" });

  useEffect(() => {
    hana.ready({ surface: "widget", version: 1 });
    hana.ui.resize({ height: 280 });
    void api<StateResponse>("api/state?surface=widget").then((result) => {
      setResponse(result);
      setStatus(result.recovery
        ? { kind: "error", message: "Draft recovery required" }
        : { kind: "idle", message: "Article ready" });
    }).catch((error) => setStatus({ kind: "error", message: errorMessage(error) }));
  }, []);

  function download(kind: "markdown" | "html"): void {
    if (!response) return;
    const { state } = response;
    const content = kind === "markdown" ? state.markdown : createWechatDocument(state.markdown, state.settings, state.title);
    const result = downloadArtifact(createDownloadArtifact(kind, state.title, content));
    setStatus(result.ok ? { kind: "success", message: `Downloaded ${result.filename}` } : { kind: "error", message: result.error ?? "Download failed" });
  }

  return (
    <div className="widget-shell">
      <div className="widget-header"><span className="brand-mark" aria-hidden="true">M</span><div><strong>Markdown WeChat</strong><span>Current article</span></div></div>
      <div className="widget-copy">
        <strong>{response?.summary.title ?? "No article"}</strong>
        <p>{response?.summary.excerpt || "Open the workspace to begin."}</p>
        <span>{response?.summary.characters.toLocaleString() ?? 0} characters</span>
      </div>
      <div className="widget-actions">
        <button className="icon-button" title="Download Markdown" aria-label="Download Markdown" disabled={!response || Boolean(response.recovery)} onClick={() => download("markdown")}>MD</button>
        <button className="icon-button" title="Download HTML" aria-label="Download HTML" disabled={!response || Boolean(response.recovery)} onClick={() => download("html")}>H</button>
      </div>
      <StatusLine status={status} />
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Markdown WeChat root element is missing");
const surface = document.body.dataset.surface === "widget" ? "widget" : "page" as Surface;
createRoot(root).render(surface === "widget" ? <WidgetApp /> : <PageApp />);
