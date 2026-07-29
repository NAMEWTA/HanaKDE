import type { MermaidConfig } from 'mermaid';
import { sanitizeMermaidSvg } from './markdown-html-sanitizer';

interface MermaidRenderResult {
  svg: string;
  bindFunctions?: (element: Element) => void;
}

export type MermaidStaticRenderResult =
  | { status: 'rendered'; svg: string }
  | { status: 'error'; message: string }
  | { status: 'cancelled' };

interface MermaidApi {
  initialize(config: MermaidConfig): void;
  render(id: string, source: string): Promise<MermaidRenderResult>;
}

type MermaidLoader = () => Promise<MermaidApi>;

const MERMAID_CONFIG: MermaidConfig = {
  startOnLoad: false,
  securityLevel: 'strict',
  htmlLabels: false,
  secure: [
    'securityLevel',
    'startOnLoad',
    'flowchart',
    'htmlLabels',
    'theme',
    'themeCSS',
    'themeVariables',
    'fontFamily',
    'altFontFamily',
  ],
  flowchart: {
    htmlLabels: false,
  },
};

let mermaidPromise: Promise<MermaidApi> | null = null;
let testLoader: MermaidLoader | null = null;
let idSeq = 0;
let renderSeq = 0;
const MERMAID_RENDER_CACHE_LIMIT = 64;
const renderCache = new Map<
  string,
  Promise<Exclude<MermaidStaticRenderResult, { status: 'cancelled' }>>
>();

async function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = (async () => {
      const mermaid = testLoader
        ? await testLoader()
        : (await import('mermaid')).default;
      mermaid.initialize(MERMAID_CONFIG);
      return mermaid;
    })();
  }
  return mermaidPromise;
}

function nextMermaidId(): string {
  idSeq += 1;
  return `hana-mermaid-${idSeq}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function renderStaticMermaidUncached(
  source: string,
): Promise<Exclude<MermaidStaticRenderResult, { status: 'cancelled' }>> {
  try {
    const mermaid = await loadMermaid();
    // Mermaid may return bindFunctions for interactive diagrams. The Knowledge
    // workspace is deliberately static, so only the SVG is accepted.
    const { svg } = await mermaid.render(nextMermaidId(), source);
    const sanitizedSvg = sanitizeMermaidSvg(svg);
    if (!sanitizedSvg) throw new Error('unsafe Mermaid SVG');
    return { status: 'rendered', svg: sanitizedSvg };
  } catch (error) {
    return { status: 'error', message: errorMessage(error) };
  }
}

function cachedStaticMermaid(
  source: string,
): Promise<Exclude<MermaidStaticRenderResult, { status: 'cancelled' }>> {
  const cached = renderCache.get(source);
  if (cached) {
    renderCache.delete(source);
    renderCache.set(source, cached);
    return cached;
  }

  const task = renderStaticMermaidUncached(source);
  renderCache.set(source, task);
  if (renderCache.size > MERMAID_RENDER_CACHE_LIMIT) {
    const oldest = renderCache.keys().next().value as string | undefined;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
  return task;
}

/**
 * Render an exact Mermaid source string through the bundled strict renderer.
 * Cancellation stops delivery to the caller; Mermaid's public API itself is
 * not abortable, so the sanitized result may still populate the bounded cache.
 */
export async function renderMermaidSvg(
  source: string,
  signal?: AbortSignal,
): Promise<MermaidStaticRenderResult> {
  if (signal?.aborted) return { status: 'cancelled' };
  const task = cachedStaticMermaid(source);
  if (!signal) return task;

  let onAbort: (() => void) | undefined;
  const cancelled = new Promise<MermaidStaticRenderResult>((resolve) => {
    onAbort = () => resolve({ status: 'cancelled' });
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([task, cancelled]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

function readSource(diagram: Element): string {
  return diagram.querySelector<HTMLElement>('.mermaid-source code')?.textContent || '';
}

function t(key: string): string {
  return (typeof window !== 'undefined' && typeof window.t === 'function')
    ? window.t(key)
    : key;
}

function ensureSourceToolbar(diagram: HTMLElement, sourceBlock: HTMLElement, source: string): void {
  const existing = diagram.querySelector<HTMLElement>('.mermaid-source-toolbar');
  if (existing?.dataset.source === source) return;
  existing?.remove();
  const toolbar = document.createElement('div');
  toolbar.className = 'mermaid-source-toolbar';
  toolbar.dataset.source = source;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mermaid-source-toggle';
  toggle.textContent = t('mermaid.viewSource');
  toggle.setAttribute('aria-expanded', sourceBlock.hasAttribute('hidden') ? 'false' : 'true');
  toggle.addEventListener('click', () => {
    const hidden = sourceBlock.hasAttribute('hidden');
    if (hidden) {
      sourceBlock.removeAttribute('hidden');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.textContent = t('mermaid.hideSource');
    } else {
      sourceBlock.setAttribute('hidden', '');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = t('mermaid.viewSource');
    }
  });

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'mermaid-source-copy';
  copy.textContent = t('mermaid.copySource');
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText?.(source);
  });

  toolbar.append(toggle, copy);
  diagram.insertBefore(toolbar, sourceBlock);
}

function ensureRenderedElement(diagram: Element): HTMLElement {
  const existing = diagram.querySelector<HTMLElement>('.mermaid-rendered');
  if (existing) return existing;

  const rendered = document.createElement('div');
  rendered.className = 'mermaid-rendered';
  diagram.appendChild(rendered);
  return rendered;
}

function hasRenderedSvg(rendered: HTMLElement): boolean {
  return !!rendered.querySelector('svg');
}

async function renderMermaidDiagram(diagram: HTMLElement): Promise<void> {
  const source = readSource(diagram);
  const rendered = ensureRenderedElement(diagram);
  const sourceBlock = diagram.querySelector<HTMLElement>('.mermaid-source');
  const status = diagram.dataset.mermaidStatus;

  if (!source.trim()) return;
  if (status === 'loading' && diagram.dataset.mermaidSource === source) {
    return;
  }
  if (status === 'rendered'
      && diagram.dataset.mermaidSource === source
      && hasRenderedSvg(rendered)) {
    if (sourceBlock) ensureSourceToolbar(diagram, sourceBlock, source);
    return;
  }
  if (status === 'error' && diagram.dataset.mermaidSource === source && rendered.textContent) {
    return;
  }

  diagram.dataset.mermaidStatus = 'loading';
  diagram.dataset.mermaidSource = source;
  const currentRenderSeq = String(++renderSeq);
  diagram.dataset.mermaidRenderSeq = currentRenderSeq;
  diagram.classList.remove('is-rendered', 'is-error');
  rendered.textContent = '';

  try {
    const result = await renderMermaidSvg(source);
    if (diagram.dataset.mermaidRenderSeq !== currentRenderSeq || readSource(diagram) !== source) return;
    if (result.status === 'cancelled') return;
    if (result.status === 'error') throw new Error(result.message);
    if (diagram.dataset.mermaidRenderSeq !== currentRenderSeq || readSource(diagram) !== source) return;
    rendered.innerHTML = result.svg;
    sourceBlock?.setAttribute('hidden', '');
    if (sourceBlock) ensureSourceToolbar(diagram, sourceBlock, source);
    diagram.dataset.mermaidStatus = 'rendered';
    diagram.classList.add('is-rendered');
  } catch (err) {
    if (diagram.dataset.mermaidRenderSeq !== currentRenderSeq || readSource(diagram) !== source) return;
    sourceBlock?.removeAttribute('hidden');
    rendered.textContent = `Mermaid diagram failed to render: ${errorMessage(err)}`;
    diagram.dataset.mermaidStatus = 'error';
    diagram.classList.add('is-error');
  }
}

export async function renderMermaidDiagrams(root: ParentNode | null): Promise<void> {
  if (!root) return;
  const diagrams = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-diagram'));
  await Promise.all(diagrams.map(renderMermaidDiagram));
}

export function __setMermaidLoaderForTests(loader: MermaidLoader | null): void {
  testLoader = loader;
  mermaidPromise = null;
  idSeq = 0;
  renderSeq = 0;
  renderCache.clear();
}
