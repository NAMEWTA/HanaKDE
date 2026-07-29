const MATHML_TAGS = new Set([
  'math', 'semantics', 'annotation',
  'mrow', 'mi', 'mn', 'mo', 'mtext', 'mspace',
  'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot',
  'mover', 'munder', 'munderover',
  'mtable', 'mtr', 'mtd', 'mstyle',
  'mpadded', 'mphantom', 'menclose',
]);

const SVG_TAGS = new Set(['svg', 'path', 'line']);

const ALLOWED_TAGS = new Set([
  'p', 'div', 'span', 'center',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'small', 'sub', 'sup',
  'br', 'hr',
  'blockquote', 'pre', 'code',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'details', 'summary',
  'a', 'label', 'img',
  ...MATHML_TAGS,
  ...SVG_TAGS,
]);

const REMOVE_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'button',
  'textarea', 'select', 'link', 'meta', 'base',
]);

const GLOBAL_ATTRS = new Set(['title', 'style']);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const ALLOWED_CLASS_NAMES = new Set([
  'markdown-callout',
  'markdown-callout-title',
  'markdown-callout-note',
  'markdown-callout-abstract',
  'markdown-callout-info',
  'markdown-callout-todo',
  'markdown-callout-tip',
  'markdown-callout-success',
  'markdown-callout-question',
  'markdown-callout-warning',
  'markdown-callout-failure',
  'markdown-callout-danger',
  'markdown-callout-bug',
  'markdown-callout-example',
  'markdown-callout-quote',
  'markdown-table-scroll',
  'mermaid-diagram',
  'mermaid-source',
  'mermaid-rendered',
  'language-mermaid',
  'is-rendered',
  'is-error',
  'task-list-item',
  'task-list-item-checkbox',
  'task-list-item-label',
  'contains-task-list',
  'footnotes',
  'footnote-ref',
  'footnote-backref',
]);
const KATEX_CLASS_NAMES = new Set([
  'katex',
  'katex-display',
  'katex-block',
  'katex-mathml',
  'katex-html',
  'base',
  'strut',
  'pstrut',
  'vlist',
  'vlist-r',
  'vlist-s',
  'vlist-t',
  'vlist-t2',
  'vlist-children',
  'mord',
  'mop',
  'mbin',
  'mrel',
  'mopen',
  'mclose',
  'mpunct',
  'minner',
  'mspace',
  'msupsub',
  'mfrac',
  'mfrac-line',
  'sqrt',
  'sqrt-sign',
  'root',
  'accent',
  'accent-body',
  'op-symbol',
  'delimsizing',
  'nulldelimiter',
  'sizing',
  'mtight',
  'text',
  'arraycolsep',
  'boxpad',
  'col-align-c',
  'col-align-l',
  'col-align-r',
  'delimcenter',
  'fbox',
  'frac-line',
  'hide-tail',
  'large-op',
  'mtable',
  'op-limits',
  'stretchy',
  'svg-align',
  'mathnormal',
  'mathit',
  'mathrm',
  'mathbf',
  'amsrm',
  'mathbb',
  'mathcal',
  'mathfrak',
  'mathtt',
  'mathscr',
  'mathsf',
  'mainrm',
]);

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:']);
const TRUSTED_IMAGE_PROTOCOLS = new Set(['http:', 'https:', 'file:']);
const EXPLICIT_PROTOCOL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const HTML_DIMENSION_RE = /^[1-9]\d{0,4}$/;
const FOOTNOTE_ID_RE = /^(?:fn|fnref)-hana-fn-[a-z0-9]+-\d+(?:-\d+)?$/;
const MATHML_ATTRS = new Set([
  'xmlns',
  'display',
  'encoding',
  'mathvariant',
  'accent',
  'accentunder',
  'stretchy',
  'fence',
  'separator',
  'lspace',
  'rspace',
  'rowspan',
  'columnspan',
  'notation',
  'displaystyle',
  'mathcolor',
  'scriptlevel',
  'columnalign',
  'columnspacing',
  'rowspacing',
]);
const SVG_ATTRS = new Set([
  'xmlns',
  'width',
  'height',
  'viewbox',
  'preserveaspectratio',
  'd',
  'x1',
  'x2',
  'y1',
  'y2',
  'stroke-width',
]);

const ALLOWED_CSS_PROPERTIES = new Set([
  'color',
  'background',
  'background-color',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-style',
  'border-width',
  'border-radius',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'text-align',
  'font-weight',
  'font-style',
  'font-size',
  'line-height',
  'letter-spacing',
  'white-space',
  'display',
  'width',
  'max-width',
  'min-width',
  'height',
  'max-height',
  'min-height',
  'top',
  'vertical-align',
]);

const ALLOWED_DISPLAY_VALUES = new Set([
  'block',
  'inline',
  'inline-block',
  'flex',
  'inline-flex',
  'grid',
  'none',
]);

const UNSAFE_CSS_VALUE_RE = /url\s*\(|expression\s*\(|@import|javascript:|vbscript:|data:|file:|behavior\s*:/i;

function sanitizeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (href.startsWith('#')) return href;
  if (!EXPLICIT_PROTOCOL_RE.test(href)) return null;

  try {
    const parsed = new URL(href);
    return SAFE_URL_PROTOCOLS.has(parsed.protocol) ? href : null;
  } catch {
    return null;
  }
}

export interface MarkdownHtmlSanitizerOptions {
  trustedImageUrls?: ReadonlySet<string>;
}

function sanitizeImageSrc(
  raw: string,
  trustedImageUrls: ReadonlySet<string>,
): string | null {
  const src = raw.trim();
  if (!src || !trustedImageUrls.has(src)) return null;
  try {
    return TRUSTED_IMAGE_PROTOCOLS.has(new URL(src).protocol) ? src : null;
  } catch {
    return null;
  }
}

function isSafeCssValue(value: string): boolean {
  if (UNSAFE_CSS_VALUE_RE.test(value)) return false;

  const lower = value.toLowerCase();
  if (/\bfixed\b/.test(lower)) return false;
  if (/\bsticky\b/.test(lower)) return false;
  return true;
}

function sanitizeStyle(raw: string): string {
  const kept: string[] = [];

  for (const declaration of raw.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 0) continue;

    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (!property || !value) continue;
    if (!ALLOWED_CSS_PROPERTIES.has(property)) continue;
    if (!isSafeCssValue(value)) continue;

    if (property === 'display' && !ALLOWED_DISPLAY_VALUES.has(value.toLowerCase())) {
      continue;
    }

    kept.push(`${property}: ${value}`);
  }

  return kept.join('; ');
}

function sanitizeClass(raw: string): string {
  return raw
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => (
      ALLOWED_CLASS_NAMES.has(token)
      || KATEX_CLASS_NAMES.has(token)
      || /^reset-size\d+$/.test(token)
      || /^size\d+$/.test(token)
      || /^delim-size\d+$/.test(token)
    ))
    .join(' ');
}

function hasClass(element: Element, className: string): boolean {
  return (element.getAttribute('class') ?? '').split(/\s+/).includes(className);
}

function isInsideKatexMarkup(element: Element): boolean {
  let current = element.parentElement;
  while (current) {
    if (hasClass(current, 'katex')) return true;
    current = current.parentElement;
  }
  return false;
}

function normalizeAriaHidden(raw: string): string | null {
  const value = raw.toLowerCase();
  if (value === 'true') return 'true';
  if (value === 'false') return 'false';
  return null;
}

function normalizeFootnoteId(tagName: string, raw: string): string | null {
  const value = raw.trim();
  if (!FOOTNOTE_ID_RE.test(value)) return null;
  if (tagName === 'a' || tagName === 'li') return value;
  return null;
}

function normalizeHeadingId(tagName: string, raw: string): string | null {
  const value = raw.trim();
  if (!HEADING_TAGS.has(tagName)) return null;
  return /^[\p{Letter}\p{Number}_-][\p{Letter}\p{Number}_:-]{0,255}$/u.test(value) ? value : null;
}

function normalizeFootnoteRole(element: Element, tagName: string, raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (tagName === 'section' && value === 'doc-endnotes' && hasClass(element, 'footnotes')) {
    return value;
  }
  if (tagName === 'a' && value === 'doc-noteref' && element.parentElement && hasClass(element.parentElement, 'footnote-ref')) {
    return value;
  }
  if (tagName === 'a' && value === 'doc-backlink' && hasClass(element, 'footnote-backref')) {
    return value;
  }
  return null;
}

function sanitizeAttributes(
  element: Element,
  tagName: string,
  options: MarkdownHtmlSanitizerOptions,
): void {
  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase();

    if (name.startsWith('on')) {
      element.removeAttribute(attr.name);
      continue;
    }

    if (tagName === 'a' && name === 'href') {
      const href = sanitizeHref(attr.value);
      if (href) {
        element.setAttribute('href', href);
        element.setAttribute('rel', 'noopener noreferrer');
      } else {
        element.removeAttribute(attr.name);
      }
      continue;
    }

    if (tagName === 'img' && name === 'src') {
      const src = sanitizeImageSrc(
        attr.value,
        options.trustedImageUrls ?? new Set(),
      );
      if (src) element.setAttribute('src', src);
      else element.removeAttribute(attr.name);
      continue;
    }

    if (tagName === 'img' && name === 'alt') {
      element.setAttribute('alt', attr.value);
      continue;
    }

    if (tagName === 'img' && (name === 'width' || name === 'height')) {
      if (HTML_DIMENSION_RE.test(attr.value.trim())) {
        element.setAttribute(name, attr.value.trim());
      } else {
        element.removeAttribute(attr.name);
      }
      continue;
    }

    if (tagName === 'img' && name === 'loading') {
      element.setAttribute('loading', 'lazy');
      continue;
    }

    if (tagName === 'img' && name === 'decoding') {
      element.setAttribute('decoding', 'async');
      continue;
    }

    if (name === 'class') {
      const className = sanitizeClass(attr.value);
      if (className) element.setAttribute('class', className);
      else element.removeAttribute(attr.name);
      continue;
    }

    if (tagName === 'details' && name === 'open') {
      element.setAttribute('open', 'open');
      continue;
    }

    if (name === 'id') {
      const normalized = normalizeFootnoteId(tagName, attr.value) || normalizeHeadingId(tagName, attr.value);
      if (normalized) element.setAttribute('id', normalized);
      else element.removeAttribute(attr.name);
      continue;
    }

    if (name === 'role') {
      const normalized = normalizeFootnoteRole(element, tagName, attr.value);
      if (normalized) element.setAttribute('role', normalized);
      else element.removeAttribute(attr.name);
      continue;
    }

    if (name === 'aria-hidden') {
      const normalized = normalizeAriaHidden(attr.value);
      if (normalized) element.setAttribute('aria-hidden', normalized);
      else element.removeAttribute(attr.name);
      continue;
    }

    if (MATHML_TAGS.has(tagName) && MATHML_ATTRS.has(name)) {
      if (isSafeCssValue(attr.value)) element.setAttribute(attr.name, attr.value);
      else element.removeAttribute(attr.name);
      continue;
    }

    if (SVG_TAGS.has(tagName) && SVG_ATTRS.has(name)) {
      if (isSafeCssValue(attr.value)) element.setAttribute(attr.name, attr.value);
      else element.removeAttribute(attr.name);
      continue;
    }

    if (GLOBAL_ATTRS.has(name)) {
      if (name === 'style') {
        const style = sanitizeStyle(attr.value);
        if (style) element.setAttribute('style', style);
        else element.removeAttribute(attr.name);
      }
      continue;
    }

    element.removeAttribute(attr.name);
  }
}

function unwrapElement(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function sanitizeChildren(
  parent: ParentNode,
  options: MarkdownHtmlSanitizerOptions,
): void {
  for (const child of Array.from(parent.childNodes)) {
    sanitizeNode(child, options);
  }
}

function sanitizeNode(
  node: ChildNode,
  options: MarkdownHtmlSanitizerOptions,
): void {
  if (node.nodeType === 3) return;

  if (node.nodeType !== 1) {
    node.parentNode?.removeChild(node);
    return;
  }

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'input') {
    if (element.getAttribute('type') === 'checkbox') {
      const checked = element.hasAttribute('checked');
      for (const attr of Array.from(element.attributes)) element.removeAttribute(attr.name);
      element.setAttribute('type', 'checkbox');
      element.setAttribute('disabled', '');
      if (checked) element.setAttribute('checked', '');
      return;
    }
    element.remove();
    return;
  }

  if (REMOVE_WITH_CONTENT.has(tagName)) {
    element.remove();
    return;
  }

  const isFootnoteSection = tagName === 'section' && hasClass(element, 'footnotes');
  if (!isFootnoteSection && !ALLOWED_TAGS.has(tagName)) {
    sanitizeChildren(element, options);
    unwrapElement(element);
    return;
  }

  // KaTeX uses tiny SVG fragments for stretchy accents; keep SVG scoped to KaTeX output.
  if (SVG_TAGS.has(tagName) && !isInsideKatexMarkup(element)) {
    element.remove();
    return;
  }

  sanitizeAttributes(element, tagName, options);
  if (tagName === 'img' && !element.getAttribute('src')) {
    element.remove();
    return;
  }
  sanitizeChildren(element, options);
}

export function sanitizeMarkdownPreviewHtml(
  html: string,
  options: MarkdownHtmlSanitizerOptions = {},
): string {
  if (typeof document === 'undefined') {
    throw new Error('Markdown preview sanitizer requires a DOM environment');
  }

  const template = document.createElement('template');
  template.innerHTML = html;
  sanitizeChildren(template.content, options);
  return template.innerHTML;
}

const MERMAID_SVG_TAGS = new Set([
  'svg',
  'g',
  'path',
  'line',
  'polyline',
  'polygon',
  'rect',
  'circle',
  'ellipse',
  'text',
  'tspan',
  'defs',
  'marker',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
  'title',
  'desc',
  'style',
]);

const MERMAID_SVG_ATTRS = new Set([
  'xmlns',
  'viewbox',
  'preserveaspectratio',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'transform',
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-opacity',
  'opacity',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
  'marker-start',
  'marker-mid',
  'marker-end',
  'orient',
  'markerwidth',
  'markerheight',
  'refx',
  'refy',
  'gradientunits',
  'gradienttransform',
  'offset',
  'stop-color',
  'stop-opacity',
  'clip-path',
  'mask',
  'role',
  'aria-label',
  'aria-hidden',
]);

const SAFE_SVG_ID_RE = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const SAFE_SVG_CLASS_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_SVG_FRAGMENT_RE = /^#[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const SAFE_SVG_URL_RE = /^url\(\s*#[A-Za-z][A-Za-z0-9_.:-]{0,127}\s*\)$/;
const SVG_ACTIVE_VALUE_RE = /(?:javascript|vbscript|data|file|https?):/i;
const SVG_CONTROL_RE = /\p{Cc}/u;
const MERMAID_CSS_VALUE_RE = /(?:url\s*\(|expression\s*\(|@import|javascript:|vbscript:|data:|file:|https?:|[<>])/i;
const MERMAID_CSS_PROPERTY_RE = /^(?:--[a-z][a-z0-9-]*|[a-z][a-z0-9-]*)$/;
const MERMAID_CSS_FORBIDDEN_PROPERTY_RE =
  /^(?:behavior|-moz-binding|animation(?:-.+)?|transition(?:-.+)?|stroke-dashoffset)$/;

function sanitizeMermaidDeclarations(raw: string): string {
  const declarations: string[] = [];
  for (const candidate of raw.split(';')) {
    const separator = candidate.indexOf(':');
    if (separator < 0) continue;
    const property = candidate.slice(0, separator).trim().toLowerCase();
    const value = candidate.slice(separator + 1).trim();
    if (
      !MERMAID_CSS_PROPERTY_RE.test(property)
      || MERMAID_CSS_FORBIDDEN_PROPERTY_RE.test(property)
      || !value
      || SVG_CONTROL_RE.test(value)
      || MERMAID_CSS_VALUE_RE.test(value)
      || value.includes('{')
      || value.includes('}')
    ) {
      continue;
    }
    declarations.push(`${property}:${value}`);
  }
  return declarations.join(';');
}

function findCssBlockEnd(css: string, openingBrace: number): number {
  let depth = 1;
  for (let index = openingBrace + 1; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function sanitizeMermaidStyleSheet(raw: string, rootId: string): string {
  if (!SAFE_SVG_ID_RE.test(rootId) || raw.length > 256 * 1024) return '';
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: string[] = [];
  let cursor = 0;
  while (cursor < css.length) {
    const openingBrace = css.indexOf('{', cursor);
    if (openingBrace < 0) break;
    const selector = css.slice(cursor, openingBrace).trim();
    const closingBrace = findCssBlockEnd(css, openingBrace);
    if (closingBrace < 0) return '';
    const body = css.slice(openingBrace + 1, closingBrace);
    cursor = closingBrace + 1;

    // Drop all at-rules, including Mermaid's optional keyframe animation.
    if (!selector || selector.startsWith('@')) continue;
    const scoped = selector
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
    if (
      scoped.length === 0
      || scoped.some(value => !value.startsWith(`#${rootId}`))
    ) {
      continue;
    }
    const declarations = sanitizeMermaidDeclarations(body);
    if (declarations) rules.push(`${scoped.join(',')}{${declarations}}`);
  }
  return rules.join('');
}

function safeMermaidSvgAttribute(name: string, value: string): boolean {
  if (SVG_CONTROL_RE.test(value) || SVG_ACTIVE_VALUE_RE.test(value)) {
    return false;
  }
  if (value.toLowerCase().includes('url(')) {
    return SAFE_SVG_URL_RE.test(value);
  }
  if (name === 'id') return SAFE_SVG_ID_RE.test(value);
  if (name === 'class') {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .every(token => SAFE_SVG_CLASS_RE.test(token));
  }
  return MERMAID_SVG_ATTRS.has(name);
}

function sanitizeMermaidSvgNode(node: ChildNode, rootId: string): void {
  if (node.nodeType === 3) return;
  if (node.nodeType !== 1) {
    node.remove();
    return;
  }
  const element = node as Element;
  const tagName = element.tagName.toLowerCase();
  if (!MERMAID_SVG_TAGS.has(tagName)) {
    element.remove();
    return;
  }
  if (tagName === 'style') {
    const style = sanitizeMermaidStyleSheet(element.textContent ?? '', rootId);
    if (!style) {
      element.remove();
    } else {
      element.textContent = style;
    }
    return;
  }
  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on')) {
      element.removeAttribute(attr.name);
      continue;
    }
    if (name === 'href' || name === 'xlink:href') {
      if (!SAFE_SVG_FRAGMENT_RE.test(attr.value)) {
        element.removeAttribute(attr.name);
      }
      continue;
    }
    if (name === 'style') {
      const style = sanitizeMermaidDeclarations(attr.value);
      if (style) {
        element.setAttribute('style', style);
      } else {
        element.removeAttribute(attr.name);
      }
      continue;
    }
    if (!safeMermaidSvgAttribute(name, attr.value)) {
      element.removeAttribute(attr.name);
    }
  }
  for (const child of Array.from(element.childNodes)) {
    sanitizeMermaidSvgNode(child, rootId);
  }
}

/**
 * Mermaid is treated as hostile even when its own securityLevel is strict.
 * Interactive bindings and active/resource-bearing SVG elements are not part
 * of the accepted output surface.
 */
export function sanitizeMermaidSvg(svg: string): string | null {
  if (typeof document === 'undefined') {
    throw new Error('Mermaid SVG sanitizer requires a DOM environment');
  }
  const template = document.createElement('template');
  template.innerHTML = svg;
  const root = template.content.querySelector('svg');
  if (!root) return null;
  const rootId = root.getAttribute('id') ?? '';
  sanitizeMermaidSvgNode(root, rootId);
  return root.isConnected || root.parentNode ? root.outerHTML : null;
}
