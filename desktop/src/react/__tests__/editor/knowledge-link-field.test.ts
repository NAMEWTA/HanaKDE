/**
 * @vitest-environment jsdom
 */
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createKnowledgeWikilinkInsertion,
  createKnowledgeLinkField,
  getKnowledgeLinkEntries,
  type KnowledgeLinkActivation,
} from '../../editor/knowledge-link-field';

const pageAddress = {
  sourceKey: 'main',
  relativePath: 'Notes/Today.md',
} as const;

const views: EditorView[] = [];

function createView(
  doc: string,
  overrides: Partial<Parameters<typeof createKnowledgeLinkField>[0]> = {},
): EditorView {
  const parent = document.body.appendChild(document.createElement('div'));
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        createKnowledgeLinkField({
          pageAddress,
          ...overrides,
        }),
      ],
    }),
  });
  views.push(view);
  return view;
}

afterEach(() => {
  while (views.length > 0) views.pop()?.destroy();
  document.body.replaceChildren();
});

describe('knowledge link field', () => {
  it('inserts same-source Page or Asset canonical paths with their real extension', () => {
    expect(createKnowledgeWikilinkInsertion(pageAddress, {
      sourceKey: 'main',
      relativePath: 'Projects/A.md',
    })).toEqual({
      ok: true,
      value: '[[Projects/A.md]]',
    });
    expect(createKnowledgeWikilinkInsertion(pageAddress, {
      sourceKey: 'main',
      relativePath: 'Notes/assets/chart.final.svg',
    }, {
      embedded: true,
    })).toEqual({
      ok: true,
      value: '![[Notes/assets/chart.final.svg]]',
    });
    expect(createKnowledgeWikilinkInsertion(pageAddress, {
      sourceKey: 'mounted-a',
      relativePath: 'Projects/A.md',
    })).toEqual({
      ok: false,
      reason: 'out_of_scope',
    });
  });

  it('uses the shared IR so code and escaped text never become links', () => {
    const source = [
      String.raw`\[[escaped.md]]`,
      '`[[inline.md]] [code](code.md)`',
      '```md',
      '[[fenced.md]]',
      '```',
      '[[Pages/Visible.md]]',
      '[Visible](../Assets/Visible%20Name.pdf#page-2)',
    ].join('\n');
    const view = createView(source);
    const entries = getKnowledgeLinkEntries(view.state);

    expect(entries).toHaveLength(2);
    expect(entries.map(entry => entry.resolution)).toEqual([
      {
        kind: 'internal',
        address: {
          sourceKey: 'main',
          relativePath: 'Pages/Visible.md',
        },
        fragment: null,
      },
      {
        kind: 'internal',
        address: {
          sourceKey: 'main',
          relativePath: 'Assets/Visible Name.pdf',
        },
        fragment: 'page-2',
      },
    ]);
  });

  it('keeps Wikilinks source-root-relative and never persists or guesses source keys', () => {
    const view = createView([
      '[[Projects/A.md]]',
      '[[other:Projects/A.md]]',
      '[up](../../Outside.md)',
      '[bad](javascript:alert(1))',
      '[encoded](bad%2Fname.md)',
      '[broken](bad%ZZ.md)',
    ].join('\n'));
    const entries = getKnowledgeLinkEntries(view.state);

    expect(view.state.doc.toString()).not.toContain('main:Projects/A.md');
    expect(entries[0]?.resolution).toEqual({
      kind: 'internal',
      address: {
        sourceKey: 'main',
        relativePath: 'Projects/A.md',
      },
      fragment: null,
    });
    expect(entries.slice(1).map(entry => entry.resolution)).toEqual([
      { kind: 'broken', reason: 'out_of_scope' },
      { kind: 'broken', reason: 'out_of_scope' },
      { kind: 'broken', reason: 'unsupported_scheme' },
      { kind: 'broken', reason: 'invalid_percent_encoding' },
      { kind: 'broken', reason: 'invalid_percent_encoding' },
    ]);
  });

  it('renders accessible internal, external, and broken states without changing Markdown', () => {
    const source = [
      '[[Pages/A.md|Alpha]]',
      '[Web](https://example.com/a)',
      '[Unsafe](file:///tmp/private)',
    ].join(' ');
    const view = createView(source);
    const elements = Array.from(
      view.dom.querySelectorAll<HTMLElement>('[data-knowledge-link-id]'),
    );

    expect(view.state.doc.toString()).toBe(source);
    expect(elements).toHaveLength(3);
    expect(elements.map(element => element.textContent)).toEqual([
      'Alpha',
      'Web',
      'Unsafe',
    ]);
    expect(elements[0]).toMatchObject({
      tabIndex: 0,
    });
    expect(elements[0]?.getAttribute('role')).toBe('link');
    expect(elements[1]?.classList.contains('cm-knowledge-link-external')).toBe(true);
    expect(elements[2]?.classList.contains('cm-knowledge-link-broken')).toBe(true);
    expect(elements[2]?.getAttribute('aria-disabled')).toBe('true');
  });

  it('checks targets through the injected source-scoped boundary and exposes missing state', async () => {
    const checked: string[] = [];
    const view = createView('[[Found.md]] [[Missing.md]]', {
      checkAddress: async (address) => {
        checked.push(`${address.sourceKey}:${address.relativePath}`);
        return address.relativePath === 'Found.md';
      },
    });

    await vi.waitFor(() => {
      expect(getKnowledgeLinkEntries(view.state).map(entry => entry.availability))
        .toEqual(['available', 'missing']);
    });
    expect(checked).toEqual(['main:Found.md', 'main:Missing.md']);
    expect(view.dom.querySelectorAll('.cm-knowledge-link-broken')).toHaveLength(1);
  });

  it('fails closed on availability errors and aborts stale checks after edits', async () => {
    const aborted = vi.fn();
    const view = createView('[[Slow.md]] [[Denied.md]]', {
      checkAddress: (address, { signal }) => {
        if (address.relativePath === 'Denied.md') {
          throw new Error('EACCES');
        }
        return new Promise<boolean>(() => {
          signal.addEventListener('abort', () => aborted(), { once: true });
        });
      },
    });

    await vi.waitFor(() => {
      expect(getKnowledgeLinkEntries(view.state)[1]?.availability).toBe('unavailable');
    });
    view.dispatch({
      changes: {
        from: 0,
        to: '[[Slow.md]]'.length,
        insert: 'plain',
      },
    });
    expect(aborted).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(view.dom.querySelector('.cm-knowledge-link-unavailable')).toBeTruthy();
    });
  });

  it('activates ordinary clicks and keyboard links with resolved same-source targets', async () => {
    const activations: KnowledgeLinkActivation[] = [];
    const view = createView(
      '[[Pages/A.md#Heading|Alpha]] [Web](https://example.com)',
      {
        onActivate: activation => {
          activations.push(activation);
        },
      },
    );
    const elements = view.dom.querySelectorAll<HTMLElement>(
      '[data-knowledge-link-id]',
    );

    elements[0]?.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      button: 0,
    }));
    elements[1]?.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'Enter',
    }));
    await Promise.resolve();

    expect(activations).toEqual([
      {
        kind: 'internal',
        sourceKind: 'wikilink',
        embedded: false,
        address: {
          sourceKey: 'main',
          relativePath: 'Pages/A.md',
        },
        fragment: 'Heading',
        availability: 'available',
      },
      {
        kind: 'external',
        sourceKind: 'markdown_link',
        embedded: false,
        url: 'https://example.com',
      },
    ]);
  });
});
