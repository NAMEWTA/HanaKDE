/**
 * @vitest-environment jsdom
 */
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeSlashMenu } from '../../components/knowledge-workspace/KnowledgeSlashMenu';
import {
  localizeKnowledgeCommands,
  type KnowledgeSlashMenuRequest,
} from '../../editor/knowledge-command-registry';

let view: EditorView | null = null;

function rect(
  left: number,
  top: number,
  right: number,
  bottom: number,
): DOMRect {
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function setup(commands = localizeKnowledgeCommands(key => key)) {
  const container = document.body.appendChild(document.createElement('div'));
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect(20, 20, 420, 320));
  view = new EditorView({
    parent: container,
    state: EditorState.create({ doc: '/' }),
  });
  vi.spyOn(view, 'coordsAtPos').mockReturnValue({
    left: 390,
    right: 391,
    top: 280,
    bottom: 300,
  });
  const request: KnowledgeSlashMenuRequest = {
    triggerFrom: 0,
    queryTo: 1,
    query: '',
    commands,
    selectedIndex: 0,
    select: vi.fn(),
    execute: vi.fn(() => true),
    dismiss: vi.fn(),
  };
  return { container, request };
}

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 't');
});

describe('KnowledgeSlashMenu', () => {
  it('renders one flat localized list with icons, descriptions, shortcut, and selection ARIA', () => {
    window.t = ((key: string) => ({
      'knowledge.commands.menuLabel': 'Markdown commands',
      'knowledge.commands.empty': 'No matches',
    })[key] ?? key) as typeof window.t;
    const commands = localizeKnowledgeCommands(key => (
      key.endsWith('.name') ? `Name ${key}` : `Description ${key}`
    ));
    const { container, request } = setup(commands);

    render(
      <KnowledgeSlashMenu
        request={request}
        getView={() => view}
        container={container}
      />,
    );

    const list = screen.getByRole('listbox', { name: 'Markdown commands' });
    expect(list).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(17);
    expect(screen.getByText('Name knowledge.commands.bold.name')).toBeTruthy();
    expect(screen.getByText('Description knowledge.commands.bold.description')).toBeTruthy();
    expect(screen.getAllByText('B').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');
    expect(list.style.visibility).toBe('visible');
    expect(Number.parseFloat(list.style.left)).toBeLessThan(390);
    expect(Number.parseFloat(list.style.maxHeight)).toBeGreaterThan(0);
  });

  it('keeps editor focus on pointer selection and executes exactly the clicked command', () => {
    const { container, request } = setup();
    render(
      <KnowledgeSlashMenu
        request={request}
        getView={() => view}
        container={container}
      />,
    );
    const second = screen.getAllByRole('option')[1];
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });

    second.dispatchEvent(down);
    fireEvent.mouseEnter(second);
    fireEvent.click(second);

    expect(down.defaultPrevented).toBe(true);
    expect(request.select).toHaveBeenCalledWith(1);
    expect(request.execute).toHaveBeenCalledWith('italic');
  });

  it('shows a non-executable empty state without creating menu levels', () => {
    window.t = ((key: string) => (
      key === 'knowledge.commands.empty' ? 'No matching commands' : key
    )) as typeof window.t;
    const { container, request } = setup([]);

    render(
      <KnowledgeSlashMenu
        request={request}
        getView={() => view}
        container={container}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('No matching commands');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('dismisses when the trigger cannot be positioned instead of escaping its editor group', () => {
    const { container, request } = setup();
    vi.mocked(view!.coordsAtPos).mockReturnValue(null);

    render(
      <KnowledgeSlashMenu
        request={request}
        getView={() => view}
        container={container}
      />,
    );

    expect(request.dismiss).toHaveBeenCalledTimes(1);
  });
});
