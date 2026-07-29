/**
 * @vitest-environment jsdom
 */
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import {
  createMarkdownEditorCompartments,
  createMarkdownEditorExtensions,
} from '../desktop/src/react/editor/create-markdown-editor-extensions.ts';
import {
  deleteFrontmatterFieldValue,
  frontmatterField,
  getFrontmatterProjection,
  setFrontmatterFieldValue,
} from '../desktop/src/react/editor/frontmatter-field.ts';
import {
  applyFrontmatterPatch,
  deleteFrontmatterProperty,
  projectFrontmatter,
  setFrontmatterProperty,
} from '../lib/knowledge-workspace/frontmatter-projection.ts';

describe('frontmatter lossless projection', () => {
  it('projects unique top-level strings with JSON scalar and flat scalar-array values', () => {
    const source = [
      '\ufeff---',
      '# page metadata',
      'title: Plain title',
      '"aliases": ["A", "B", null, true, 2.5]',
      'published: false # retained inline comment',
      'empty:',
      '---',
      '# Body',
    ].join('\r\n');
    const projection = projectFrontmatter(source);

    expect(projection).toMatchObject({
      mode: 'properties',
      fields: [
        { key: 'title', value: 'Plain title' },
        { key: 'aliases', value: ['A', 'B', null, true, 2.5] },
        { key: 'published', value: false },
        { key: 'empty', value: null },
      ],
    });
    if (projection.mode !== 'properties') throw new Error('expected properties');
    expect(source.slice(
      projection.fields[2].valueRange.from,
      projection.fields[2].valueRange.to,
    )).toBe('false');
  });

  it.each([
    ['anchor/alias', 'a: &base 1\nb: *base\n', 'anchor_or_alias'],
    ['nested map', 'a:\n  child: 1\n', 'nested_structure'],
    ['nested flow map', 'a: { child: 1 }\n', 'nested_structure'],
    ['nested sequence', 'a: [[1]]\n', 'nested_structure'],
    ['duplicate key', 'a: 1\na: 2\n', 'duplicate_key'],
    ['merge key', '<<: value\n', 'merge_key'],
    ['custom tag', 'a: !thing value\n', 'custom_tag'],
    ['block scalar', 'a: |\n  value\n', 'block_scalar'],
    ['timestamp', 'a: 2026-07-29\n', 'unsupported_value'],
    ['non-finite number', 'a: .nan\n', 'unsupported_value'],
    ['invalid YAML', 'a: [1,\n', 'uncertain_range'],
    ['directive', '%YAML 1.2\na: 1\n', 'directive_or_multiple_documents'],
    ['document end', 'a: 1\n...\n', 'directive_or_multiple_documents'],
  ])('falls the whole region back to source for %s', (_label, content, reason) => {
    expect(projectFrontmatter(`---\n${content}---\nBody`)).toEqual({
      mode: 'source',
      reason,
      range: { from: 0, to: `---\n${content}---`.length },
    });
  });

  it('treats missing, malformed-boundary, and multi-document-like input as source', () => {
    expect(projectFrontmatter('# Body')).toEqual({
      mode: 'source',
      reason: 'absent',
      range: null,
    });
    expect(projectFrontmatter('---\na: 1\n...\nBody')).toEqual({
      mode: 'source',
      reason: 'absent',
      range: null,
    });
    const multiple = '---\na: 1\n---\n---\nb: 2\n---';
    const first = projectFrontmatter(multiple);
    expect(first).toMatchObject({
      mode: 'properties',
      fields: [{ key: 'a', value: 1 }],
    });
    expect(multiple.slice(first.range?.to ?? 0)).toBe('\n---\nb: 2\n---');
  });

  it('modifies only the value range and preserves comments, order, CRLF, and body', () => {
    const source = [
      '---',
      '# keep',
      'first: old # inline',
      'second: [1, true]',
      '---',
      'Body',
      '',
    ].join('\r\n');
    const patch = setFrontmatterProperty(source, 'first', 'new # literal');
    expect(patch).toEqual({
      ok: true,
      from: source.indexOf('old'),
      to: source.indexOf('old') + 3,
      insert: '"new # literal"',
    });
    expect(applyFrontmatterPatch(source, patch)).toBe([
      '---',
      '# keep',
      'first: "new # literal" # inline',
      'second: [1, true]',
      '---',
      'Body',
      '',
    ].join('\r\n'));
  });

  it('fills an empty value before its existing spacing and inline comment', () => {
    const source = '---\na:   # keep\n---\nBody';
    const patch = setFrontmatterProperty(source, 'a', 1);
    expect(applyFrontmatterPatch(source, patch)).toBe(
      '---\na: 1   # keep\n---\nBody',
    );
    expect(projectFrontmatter(applyFrontmatterPatch(source, patch))).toMatchObject({
      mode: 'properties',
      fields: [{ key: 'a', value: 1 }],
    });
  });

  it('adds one quoted key before the closer using the existing final line ending', () => {
    const source = '---\r\none: 1\ntwo: 2\r\n---\r\nBody';
    const patch = setFrontmatterProperty(source, 'new:key', ['x', 3, null]);
    expect(applyFrontmatterPatch(source, patch)).toBe(
      '---\r\none: 1\ntwo: 2\r\n"new:key": ["x", 3, null]\r\n---\r\nBody',
    );
  });

  it('deletes only the field line and retains adjacent independent comments', () => {
    const source = [
      '---',
      '# belongs to the document',
      'remove: true # inline belongs to field',
      '# keep this independent comment',
      'stay: value',
      '---',
      'Body',
    ].join('\n');
    const patch = deleteFrontmatterProperty(source, 'remove');
    expect(applyFrontmatterPatch(source, patch)).toBe([
      '---',
      '# belongs to the document',
      '# keep this independent comment',
      'stay: value',
      '---',
      'Body',
    ].join('\n'));
  });

  it('keeps the exact source for invalid edits or source-mode regions', () => {
    const source = '---\na: &anchor 1\n---\nBody';
    for (const patch of [
      setFrontmatterProperty(source, 'b', 2),
      setFrontmatterProperty('---\na: 1\n---', '', 2),
      setFrontmatterProperty('---\na: 1\n---', 'b', Number.NaN),
      deleteFrontmatterProperty('---\na: 1\n---', 'missing'),
    ]) {
      expect(patch.ok).toBe(false);
      expect(applyFrontmatterPatch(source, patch)).toBe(source);
    }
  });

  it('renders only fully safe regions as an accessible CM6 properties widget', () => {
    const safeParent = document.body.appendChild(document.createElement('div'));
    const safe = new EditorView({
      parent: safeParent,
      state: EditorState.create({
        doc: '---\ntitle: Page\ncount: 2\n---\nBody',
        extensions: [frontmatterField],
      }),
    });
    expect(safe.dom.querySelector('.cm-frontmatter-properties')).toBeTruthy();
    expect(safe.dom.querySelector('.cm-frontmatter-properties')?.getAttribute(
      'aria-label',
    )).toBe('knowledge.frontmatter.label');
    expect(safe.dom.querySelectorAll('.cm-frontmatter-row')).toHaveLength(2);
    safe.destroy();
    safeParent.remove();

    const complexParent = document.body.appendChild(document.createElement('div'));
    const complex = new EditorView({
      parent: complexParent,
      state: EditorState.create({
        doc: '---\nmeta:\n  nested: true\n---\nBody',
        extensions: [frontmatterField],
      }),
    });
    expect(getFrontmatterProjection(complex.state)).toMatchObject({
      mode: 'source',
      reason: 'nested_structure',
    });
    expect(complex.dom.querySelector('.cm-frontmatter-properties')).toBeNull();
    expect(complex.state.doc.toString()).toContain('  nested: true');
    complex.destroy();
    complexParent.remove();
  });

  it('is installed by the shared policy-driven Markdown surface factory', () => {
    const parent = document.body.appendChild(document.createElement('div'));
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: '---\ntitle: Integrated\n---\nBody',
        extensions: createMarkdownEditorExtensions({
          mode: 'markdown',
          readOnly: false,
          compartments: createMarkdownEditorCompartments(),
          imageContext: {},
          observeExtension: [],
          onOpenBlockMenu: () => undefined,
        }),
      }),
    });
    expect(view.dom.querySelector('.cm-frontmatter-properties')).toBeTruthy();
    expect(view.dom.querySelector('.cm-frontmatter-value')).toHaveProperty(
      'value',
      '"Integrated"',
    );
    view.destroy();
    parent.remove();
  });

  it('uses exactly one CM6 transaction for set, add, and delete, then revalidates', () => {
    const transactions: number[] = [];
    const parent = document.body.appendChild(document.createElement('div'));
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: '---\r\n# keep\r\none: 1\r\ntwo: 2\r\n---\r\nBody',
        extensions: [
          frontmatterField,
          EditorView.updateListener.of(update => {
            if (update.docChanged) transactions.push(update.transactions.length);
          }),
        ],
      }),
    });

    expect(setFrontmatterFieldValue(view, 'one', 'changed')).toBe(true);
    expect(setFrontmatterFieldValue(view, 'three', [3, true])).toBe(true);
    expect(deleteFrontmatterFieldValue(view, 'two')).toBe(true);
    expect(transactions).toEqual([1, 1, 1]);
    expect(view.state.doc.toString()).toBe(
      '---\n# keep\none: "changed"\n"three": [3, true]\n---\nBody',
    );
    expect(getFrontmatterProjection(view.state)).toMatchObject({
      mode: 'properties',
      fields: [
        { key: 'one', value: 'changed' },
        { key: 'three', value: [3, true] },
      ],
    });

    view.dispatch({
      changes: {
        from: view.state.doc.toString().indexOf('one: "changed"'),
        to: view.state.doc.toString().indexOf('one: "changed"')
          + 'one: "changed"'.length,
        insert: 'one: &anchor 1',
      },
    });
    expect(getFrontmatterProjection(view.state)).toMatchObject({
      mode: 'source',
      reason: 'anchor_or_alias',
    });
    expect(view.dom.querySelector('.cm-frontmatter-properties')).toBeNull();
    expect(view.state.doc.toString()).toContain('one: &anchor 1');
    view.destroy();
    parent.remove();
  });

  it('keeps invalid visual input local and commits valid input as one transaction', () => {
    let changes = 0;
    const parent = document.body.appendChild(document.createElement('div'));
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: '---\na: 1\n---\nBody',
        extensions: [
          frontmatterField,
          EditorView.updateListener.of(update => {
            if (update.docChanged) changes += 1;
          }),
        ],
      }),
    });
    const input = view.dom.querySelector<HTMLInputElement>('.cm-frontmatter-value')!;
    const apply = view.dom.querySelector<HTMLButtonElement>('.cm-frontmatter-apply')!;
    input.value = '{"nested":true}';
    apply.click();
    expect(changes).toBe(0);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(view.state.doc.toString()).toBe('---\na: 1\n---\nBody');

    input.value = '["safe", 2]';
    apply.click();
    expect(changes).toBe(1);
    expect(view.state.doc.toString()).toBe('---\na: ["safe", 2]\n---\nBody');
    view.destroy();
    parent.remove();
  });
});
