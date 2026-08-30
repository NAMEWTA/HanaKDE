import { describe, expect, it, vi } from "vitest";

import { DossiersBrowserApi, normalizeWorkspaceRef, workspaceLabel } from "../../src/ui/browser-app.ts";
import { renderPage } from "../../routes/page.ts";

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

describe("Dossiers Page host boundary", () => {
  it("renders a CSP-protected route shell and rejects unsafe host CSS", () => {
    const html = renderPage({
      req: { query: (name) => name === "hana-css" ? "https://outside.invalid/theme.css" : name === "hana-theme" ? "x\"><script>" : undefined, json: async () => ({}) },
      html: (value) => value,
      json: (value) => value
    });
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("/api/plugins/dossiers/assets/page.js");
    expect(html).not.toContain("outside.invalid");
    expect(html).not.toContain("<script><script>");
  });

  it("keeps same-plugin data requests on hana.api.fetch", async () => {
    const sdkFetch = vi.fn(async (_path: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      if (request.operation === "workspace.open") return response({ compatibility: { state: "ready" } });
      if (request.operation === "catalog.types") return response({ items: [] });
      return response({ error: { code: "validation", message: "unexpected", details: {} } }, 400);
    });
    const globalFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("global fetch must not be used"));
    const api = new DossiersBrowserApi({ api: { fetch: sdkFetch } } as never, { kind: "mount", mountId: "workspace", path: "" });

    await expect(api.openWorkspace()).resolves.toMatchObject({ compatibility: { state: "ready" } });
    await expect(api.catalogClient().listTypes()).resolves.toEqual({ items: [] });
    expect(globalFetch).not.toHaveBeenCalled();
    expect(sdkFetch).toHaveBeenCalledTimes(2);
    expect(sdkFetch.mock.calls.every(([path]) => path === "ui/dispatch")).toBe(true);
    globalFetch.mockRestore();
  });

  it("normalizes workspace references without exposing their absolute path as the label", () => {
    const ref = normalizeWorkspaceRef({ kind: "local-file", path: "C:/private/acme-workspace", name: "acme-workspace", secret: "drop" });
    expect(ref).toEqual({ kind: "local-file", path: "C:/private/acme-workspace", name: "acme-workspace" });
    expect(workspaceLabel(ref!)).toBe("acme-workspace");
  });
});
