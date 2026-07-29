import { EditorView } from '@codemirror/view';

export const codeTheme = EditorView.theme({
  '&': { fontSize: '0.84rem' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.7',
    padding: 'var(--space-24) 0',
  },
  '.cm-content': {
    width: '100%',
    padding: '0 var(--space-16)',
  },
});

export const markdownTheme = EditorView.theme({
  '&': {
    fontSize: 'var(--editor-markdown-font-size)',
    '--editor-markdown-content-inset-x': 'max(var(--editor-markdown-content-padding-x), var(--editor-markdown-block-rail-space, 0px))',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--editor-markdown-font-family, var(--font-serif))',
    lineHeight: 'var(--editor-markdown-line-height)',
    padding: 'calc(var(--space-40) + var(--space-24)) 0 var(--preview-markdown-editor-bottom-space, var(--space-16))',
  },
  '&.cm-markdown-has-top-cover .cm-scroller': {
    paddingTop: '0',
  },
  '.cm-content': {
    width: '100%',
    padding: '0 var(--editor-markdown-content-inset-x)',
  },
  '.cm-line': {
    maxWidth: 'var(--editor-markdown-content-width)',
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  '.cm-line.cm-markdown-cover-line': {
    maxWidth: 'none',
  },
  '.cm-line.cm-unconfirmed-heading-line *': {
    fontSize: 'var(--editor-markdown-font-size)',
    fontWeight: 'inherit',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '.cm-md-mark': {
    backgroundColor: 'var(--cm-md-mark-bg, rgba(255, 248, 143, 0.72))',
    borderRadius: '2px',
    padding: '0 1px',
  },
  '.cm-knowledge-link': {
    color: 'var(--link)',
    textDecoration: 'underline',
    textDecorationColor: 'color-mix(in srgb, var(--link) 55%, transparent)',
    textUnderlineOffset: '2px',
    cursor: 'pointer',
    borderRadius: '2px',
  },
  '.cm-knowledge-link:focus-visible': {
    outline: '2px solid var(--accent, var(--link))',
    outlineOffset: '2px',
  },
  '.cm-knowledge-link-external::after': {
    content: '" ↗"',
    fontSize: '0.72em',
    textDecoration: 'none',
  },
  '.cm-knowledge-link-broken': {
    color: 'var(--danger, #b54a4a)',
    textDecorationStyle: 'wavy',
  },
  '.cm-knowledge-link-checking': {
    opacity: '0.72',
  },
  '.cm-knowledge-link-unavailable': {
    color: 'var(--text-muted)',
    textDecorationStyle: 'dotted',
    cursor: 'not-allowed',
  },
  '.cm-page-task': {
    inlineSize: '1rem',
    blockSize: '1rem',
    margin: '0 var(--space-4) 0 0',
    accentColor: 'var(--accent)',
    verticalAlign: 'text-bottom',
    cursor: 'pointer',
  },
  '.cm-page-task:focus-visible': {
    outline: '2px solid var(--accent)',
    outlineOffset: '2px',
  },
  '.cm-page-task:disabled': {
    cursor: 'not-allowed',
    opacity: '0.6',
  },
  '.cm-frontmatter-properties': {
    display: 'grid',
    gap: 'var(--space-8)',
    maxWidth: 'var(--editor-markdown-content-width)',
    margin: '0 auto var(--space-16)',
    padding: 'var(--space-12)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--surface, var(--bg))',
    color: 'var(--text)',
    fontFamily: 'var(--font-ui)',
    fontSize: '0.78rem',
    boxSizing: 'border-box',
  },
  '.cm-frontmatter-heading': {
    color: 'var(--text-muted)',
    fontWeight: '600',
  },
  '.cm-frontmatter-rows': {
    display: 'grid',
    gap: 'var(--space-6)',
  },
  '.cm-frontmatter-row, .cm-frontmatter-add': {
    display: 'grid',
    gridTemplateColumns: 'minmax(90px, 0.7fr) minmax(140px, 1.5fr) auto auto',
    gap: 'var(--space-6)',
    alignItems: 'center',
  },
  '.cm-frontmatter-key': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: '600',
  },
  '.cm-frontmatter-value, .cm-frontmatter-new-key, .cm-frontmatter-new-value': {
    minWidth: '0',
    padding: 'var(--space-6) var(--space-8)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--input-bg, var(--bg))',
    color: 'var(--text)',
    font: 'inherit',
  },
  '.cm-frontmatter-value:focus-visible, .cm-frontmatter-new-key:focus-visible, .cm-frontmatter-new-value:focus-visible, .cm-frontmatter-properties button:focus-visible': {
    outline: '2px solid var(--accent)',
    outlineOffset: '2px',
  },
  '.cm-frontmatter-properties button': {
    minHeight: '28px',
    padding: 'var(--space-4) var(--space-8)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--button-bg, var(--overlay-subtle))',
    color: 'var(--text)',
    font: 'inherit',
    cursor: 'pointer',
  },
  '.cm-frontmatter-delete': {
    color: 'var(--danger, #b54a4a)',
  },
  '.cm-frontmatter-status': {
    margin: '0',
    color: 'var(--danger, #b54a4a)',
  },
  '@media (max-width: 560px)': {
    '.cm-page-task': {
      inlineSize: '1.125rem',
      blockSize: '1.125rem',
    },
    '.cm-knowledge-link': {
      textUnderlineOffset: '3px',
    },
    '.cm-frontmatter-row, .cm-frontmatter-add': {
      gridTemplateColumns: '1fr auto',
    },
    '.cm-frontmatter-key, .cm-frontmatter-new-key': {
      gridColumn: '1 / -1',
    },
  },
  '.cm-math-widget': {
    fontFamily: 'var(--editor-markdown-font-family, var(--font-serif))',
  },
  '.cm-math-block-widget': {
    display: 'block',
    overflowX: 'auto',
    padding: 'var(--space-4) 0',
    borderRadius: 'var(--radius-sm)',
    cursor: 'text',
  },
  '.cm-math-block-widget:hover': {
    backgroundColor: 'var(--overlay-subtle)',
  },
  '.cm-markdown-cover': {
    position: 'relative',
    width: '100%',
    maxWidth: 'none',
    minHeight: '160px',
    maxHeight: '720px',
    margin: '0 auto',
    paddingBottom: 'var(--space-24)',
    boxSizing: 'content-box',
    overflow: 'hidden',
    backgroundColor: 'transparent',
    userSelect: 'none',
    touchAction: 'none',
  },
  '.cm-markdown-cover.cm-markdown-cover-top': {
    marginTop: '0',
  },
  '.cm-markdown-cover.cm-markdown-cover-bleed-x': {
    marginLeft: 'calc(0px - var(--editor-markdown-content-inset-x))',
    marginRight: 'calc(0px - var(--editor-markdown-content-inset-x))',
    width: 'calc(100% + var(--editor-markdown-content-inset-x) + var(--editor-markdown-content-inset-x))',
  },
  '.cm-markdown-cover::after': {
    content: '""',
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    border: '1px solid color-mix(in srgb, var(--accent) 58%, transparent)',
    boxShadow: [
      'inset 0 0 0 999px color-mix(in srgb, var(--accent) 8%, transparent)',
      'inset 0 -2px 0 color-mix(in srgb, var(--accent) 72%, transparent)',
    ].join(', '),
    opacity: '0',
    transition: 'opacity var(--duration-fast) var(--ease-out)',
  },
  '.cm-markdown-cover.cm-markdown-cover-drop-active::after': {
    opacity: '1',
  },
  '.cm-markdown-cover img': {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    cursor: 'grab',
  },
  '.cm-markdown-cover img:active': {
    cursor: 'grabbing',
  },
  '.cm-markdown-cover-resize': {
    position: 'absolute',
    left: '0',
    right: '0',
    bottom: 'var(--space-24)',
    height: '10px',
    cursor: 'ns-resize',
  },
  '.cm-markdown-cover-resize::after': {
    content: '""',
    position: 'absolute',
    left: '50%',
    bottom: '3px',
    width: '56px',
    height: '2px',
    transform: 'translateX(-50%)',
    borderRadius: '999px',
    backgroundColor: 'var(--overlay-medium, rgba(0, 0, 0, 0.16))',
    opacity: '0',
    transition: 'opacity var(--duration-fast)',
  },
  '.cm-markdown-cover:hover .cm-markdown-cover-resize::after': {
    opacity: '0.8',
  },
  '.cm-markdown-cover-missing': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeft: '3px solid var(--accent, var(--mood-text, var(--text-muted)))',
    backgroundColor: 'var(--overlay-subtle)',
    color: 'var(--text-muted)',
    fontSize: '0.7rem',
  },
});
