/**
 * @vitest-environment jsdom
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeKnowledgeExternalUrl,
  openKnowledgeExternalLink,
} from '../desktop/src/react/utils/knowledge-safe-rendering.ts';

afterEach(() => {
  delete (window as Partial<Window>).platform;
  vi.restoreAllMocks();
});

describe('knowledge external-link boundary', () => {
  it('normalizes only explicit HTTP and HTTPS URLs', () => {
    expect(normalizeKnowledgeExternalUrl('HTTPS://Example.COM/a?b=1#c'))
      .toBe('https://example.com/a?b=1#c');
    for (const value of [
      '',
      'example.com',
      '//example.com',
      'javascript:alert(1)',
      'data:text/html,boom',
      'file:///private/secret',
      'blob:https://example.com/id',
      'mailto:test@example.com',
    ]) {
      expect(normalizeKnowledgeExternalUrl(value)).toBeNull();
    }
  });

  it('hands a safe URL to the system boundary only for an explicit activation call', () => {
    const openExternal = vi.fn();
    window.platform = { openExternal } as unknown as typeof window.platform;

    expect(openKnowledgeExternalLink('https://example.com/page')).toBe(true);
    expect(openExternal).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith('https://example.com/page');

    for (const value of [
      'javascript:alert(1)',
      'data:text/html,boom',
      'file:///private/secret',
      'relative/page',
    ]) {
      expect(openKnowledgeExternalLink(value)).toBe(false);
    }
    expect(openExternal).toHaveBeenCalledOnce();
  });

  it('keeps the Electron main boundary fail-closed and preload free of navigation side effects', () => {
    const main = fs.readFileSync(path.join(process.cwd(), 'desktop/main.cjs'), 'utf8');
    const preload = fs.readFileSync(path.join(process.cwd(), 'desktop/preload.cjs'), 'utf8');

    expect(main).toMatch(
      /wrapIpcBestEffortHandler\("open-external"[\s\S]*parsed\.protocol === "https:"[\s\S]*parsed\.protocol === "http:"[\s\S]*shell\.openExternal/u,
    );
    expect(preload).toContain(
      'openExternal: (url) => ipcRenderer.invoke("open-external", url)',
    );
    expect(preload).not.toMatch(/openExternal:[^\n]+(?:window\.open|location)/u);
  });
});
