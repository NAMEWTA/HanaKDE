// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspaceTreeRow } from '../../components/shared/WorkspaceTreeRow';

describe('WorkspaceTreeRow', () => {
  it('renders the shared tree slots while forwarding row semantics', () => {
    render(
      <WorkspaceTreeRow
        aria-level={3}
        aria-selected="true"
        data-resource-path="notes/reference.md"
        depth={2}
        disclosure={<button type="button">Toggle</button>}
        iconMarkup={'<svg data-icon="markdown"></svg>'}
        name="reference.md"
        role="treeitem"
        selected
        trailing={<button type="button">More</button>}
      />,
    );

    const row = screen.getByRole('treeitem', { name: 'reference.md' });
    expect(row).toHaveAttribute('aria-level', '3');
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(row).toHaveAttribute('data-resource-path', 'notes/reference.md');
    expect(row).toHaveStyle({ '--workspace-tree-depth': '2' });
    expect(row.querySelector('[data-icon="markdown"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  });
});
