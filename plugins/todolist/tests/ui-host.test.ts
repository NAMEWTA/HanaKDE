import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { mountTodoApp } from "../src/ui/browser-app.ts";

const browserGlobals = [
  "window",
  "document",
  "HTMLElement",
  "HTMLFormElement",
  "FormData",
  "requestAnimationFrame",
  "cancelAnimationFrame",
] as const;

function installBrowser(): { dom: JSDOM; restore(): void } {
  const dom = new JSDOM("<!doctype html><html lang=\"en\"><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://127.0.0.1/api/plugins/todolist/page?pluginSurfaceSession=test-session",
  });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  const values: Record<(typeof browserGlobals)[number], unknown> = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLFormElement: dom.window.HTMLFormElement,
    FormData: dom.window.FormData,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  };
  for (const key of browserGlobals) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: values[key] });
  }
  return {
    dom,
    restore() {
      dom.window.close();
      for (const key of browserGlobals) {
        const descriptor = previous.get(key);
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("Todo page renders its shell and signals ready before initial data resolves", () => {
  const browser = installBrowser();
  let readyCount = 0;
  const sdk = {
    ready() { readyCount += 1; },
    api: { fetch: () => new Promise<Response>(() => {}) },
    ui: { resize() {} },
    resources: { pick: async () => ({ resources: [] }) },
  };
  try {
    const root = browser.dom.window.document.getElementById("root");
    assert.ok(root);
    const dispose = mountTodoApp(root, sdk);
    assert.ok(root.querySelector(".app-shell"));
    assert.equal(readyCount, 1);
    dispose();
  } finally {
    browser.restore();
  }
});

test("Todo page leaves loading and offers retry when the backend does not respond", async () => {
  const browser = installBrowser();
  const sdk = {
    ready() {},
    api: { fetch: () => new Promise<Response>(() => {}) },
    ui: { resize() {} },
    resources: { pick: async () => ({ resources: [] }) },
  };
  try {
    const root = browser.dom.window.document.getElementById("root");
    assert.ok(root);
    const dispose = mountTodoApp(root, sdk, { requestTimeoutMs: 10 });
    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.equal(root.querySelector(".spinner"), null);
    assert.match(root.querySelector(".state-error")?.textContent ?? "", /did not respond/i);
    assert.ok(root.querySelector("[data-reload]"));
    dispose();
  } finally {
    browser.restore();
  }
});

test("Todo page routes initial API calls exclusively through the injected SDK", async () => {
  const browser = installBrowser();
  const sdkRoutes: string[] = [];
  let globalFetchCount = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    globalFetchCount += 1;
    throw new Error("unauthenticated global fetch must not be used");
  };
  const sdk = {
    ready() {},
    api: {
      async fetch(route: string) {
        sdkRoutes.push(route);
        if (route === "api/projects") return response({ items: [] });
        if (route === "api/status") return response({ store: { writable: true }, runtime: {} });
        if (route === "api/agents") return response({ agents: [] });
        return response({ items: [] });
      },
    },
    ui: { resize() {} },
    resources: { pick: async () => ({ resources: [] }) },
  };
  try {
    const root = browser.dom.window.document.getElementById("root");
    assert.ok(root);
    const dispose = mountTodoApp(root, sdk);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(globalFetchCount, 0);
    assert.equal(sdkRoutes.some((route) => route.startsWith("api/todos?")), true);
    assert.deepEqual(sdkRoutes.filter((route) => !route.startsWith("api/todos?")).sort(), [
      "api/agents",
      "api/projects",
      "api/status",
    ]);
    dispose();
  } finally {
    globalThis.fetch = previousFetch;
    browser.restore();
  }
});

test("quick capture moves an unscheduled Todo from Today into the visible Inbox", async () => {
  const browser = installBrowser();
  const todo = {
    id: "todo-created",
    title: "Visible after capture",
    status: "pending",
    priority: "none",
    mode: "manual",
    version: 1,
  };
  let created = false;
  const sdk = {
    ready() {},
    api: {
      async fetch(route: string, init?: RequestInit) {
        if (route.startsWith("api/todos?") && init?.method !== "POST") {
          return response({ items: created && route.includes("view=inbox") ? [todo] : [] });
        }
        if (route === "api/todos" && init?.method === "POST") {
          created = true;
          return response({ ok: true, value: todo });
        }
        if (route === "api/projects") return response({ items: [] });
        if (route === "api/status") return response({ store: { writable: true }, runtime: {} });
        if (route === "api/agents") return response({ agents: [] });
        return response({ items: [] });
      },
    },
    ui: { resize() {} },
    resources: { pick: async () => ({ resources: [] }) },
  };
  try {
    const root = browser.dom.window.document.getElementById("root");
    assert.ok(root);
    const dispose = mountTodoApp(root, sdk);
    await settle();

    const title = root.querySelector<HTMLInputElement>("#capture-title");
    const form = root.querySelector<HTMLFormElement>("[data-capture]");
    assert.ok(title);
    assert.ok(form);
    title.value = todo.title;
    form.dispatchEvent(new browser.dom.window.SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await settle();

    assert.equal(root.querySelector(".todo-title")?.textContent, todo.title);
    assert.equal(root.querySelector('[data-nav="inbox"]')?.classList.contains("is-active"), true);
    dispose();
  } finally {
    browser.restore();
  }
});
