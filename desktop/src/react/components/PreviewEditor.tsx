import { forwardRef, useCallback, useMemo } from 'react';
import {
  MarkdownEditorSurface,
  type MarkdownEditorSurfaceHandle,
  type MarkdownEditorSurfacePolicy,
  type MarkdownEditorSurfaceProps,
} from './preview/MarkdownEditorSurface';
import { requestUserEditCheckpoint, type UserEditCheckpointReason } from '../utils/checkpoints';
import {
  arrayBufferToBase64,
  buildMarkdownAttachmentPlan,
} from '../utils/markdown-attachments';
import { applyMarkdownCoverImageDrop } from '../utils/markdown-cover-drop';
import { clearAppFileDragPayload, readAppFileDragPayload } from '../utils/app-file-drag';
import { openInternalLink } from '../utils/link-open';
import { isRemoteWorkbenchContentRef } from '../utils/remote-file-preview';
import type { FileVersion, VersionedWriteResult } from '../types';

export type PreviewEditorHandle = MarkdownEditorSurfaceHandle;
export type PreviewEditorScrollOptions = import('./preview/MarkdownEditorSurface').MarkdownEditorSurfaceScrollOptions;
export type PreviewEditorStats = import('./preview/MarkdownEditorSurface').MarkdownEditorSurfaceStats;
export type PreviewEditorQuoteRange = import('./preview/MarkdownEditorSurface').MarkdownEditorSurfaceQuoteRange;

export type PreviewEditorSaveDocument = (
  content: string,
  expectedVersion?: FileVersion | null,
) => Promise<VersionedWriteResult>;

export interface PreviewEditorProps extends Omit<MarkdownEditorSurfaceProps, 'policy'> {
  saveDocument?: PreviewEditorSaveDocument;
}

const SAVE_DELAY = 600;
const CHECKPOINT_INTERVAL = 5 * 60 * 1000;

interface PreviewAttachmentSource {
  file?: File;
  path?: string;
  name: string;
  mimeType?: string | null;
}

function filesFromDataTransfer(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return [];
  const files = Array.from(dataTransfer.files || []);
  if (files.length > 0) return files;
  return Array.from(dataTransfer.items || [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

function previewAttachmentSources(dataTransfer: DataTransfer | null): PreviewAttachmentSource[] {
  const payload = readAppFileDragPayload(dataTransfer);
  if (payload) {
    clearAppFileDragPayload(payload.dragId);
    return payload.files
      .filter(file => !file.isDirectory && Boolean(file.path))
      .map(file => ({
        path: file.path,
        name: file.name || file.path,
        mimeType: file.mimeType || null,
      }));
  }
  return filesFromDataTransfer(dataTransfer)
    .filter(file => !file.name.endsWith('/'))
    .map(file => ({
      file,
      path: window.platform?.getFilePath?.(file) || undefined,
      name: file.name,
      mimeType: file.type || null,
    }));
}

function previewDataTransferHasAttachments(dataTransfer: DataTransfer | null): boolean {
  if (readAppFileDragPayload(dataTransfer)) return true;
  if (dataTransfer?.files?.length) return true;
  return Array.from(dataTransfer?.types || []).includes('Files');
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function showSaveError(prefixKey: string, err: unknown): void {
  const tFn = window.t ?? ((p: string) => p);
  window.dispatchEvent(new CustomEvent('hana-inline-notice', {
    detail: { text: `${tFn(prefixKey)}: ${getErrorMessage(err)}`, type: 'error' },
  }));
}

export const PreviewEditor = forwardRef<PreviewEditorHandle, PreviewEditorProps>(
  function PreviewEditor({ filePath, remoteContentRef, saveDocument, ...props }, ref) {
    const execute = useCallback(async (
      content: string,
      expectedVersion: FileVersion | null,
    ): Promise<VersionedWriteResult> => {
      if (saveDocument) return saveDocument(content, expectedVersion);
      if (!filePath) return { ok: true, conflict: false, version: null };
      if (window.platform?.writeFileIfUnchanged) {
        return window.platform.writeFileIfUnchanged(filePath, content, expectedVersion);
      }
      const ok = await window.platform?.writeFile(filePath, content);
      return {
        ok: ok !== false,
        conflict: false,
        version: null,
      };
    }, [filePath, saveDocument]);

    const checkpoint = useCallback(async (reason: 'edit-start' | 'autosave-interval') => {
      if (!filePath) return;
      await requestUserEditCheckpoint(filePath, reason as UserEditCheckpointReason);
    }, [filePath]);

    const attachment = useMemo<NonNullable<MarkdownEditorSurfacePolicy['attachment']> | null>(() => {
      const remoteTarget = isRemoteWorkbenchContentRef(remoteContentRef)
        ? remoteContentRef
        : null;
      if (!filePath && !remoteTarget) return null;
      return {
        imageContext: {
          filePath,
          getFileUrl: window.platform?.getFileUrl,
        },
        accepts: filePath ? previewDataTransferHasAttachments : undefined,
        insert: filePath ? async (dataTransfer) => {
          const sources = previewAttachmentSources(dataTransfer);
          const markdown: string[] = [];
          for (let index = 0; index < sources.length; index += 1) {
            const source = sources[index];
            const plan = buildMarkdownAttachmentPlan({
              markdownFilePath: filePath,
              originalName: source.name,
              mimeType: source.mimeType,
              index,
            });
            let copied = false;
            if (source.path && typeof window.platform?.copyFile === 'function') {
              copied = await window.platform.copyFile(source.path, plan.attachmentPath);
            }
            if (!copied) {
              if (!source.file) throw new Error(`cannot copy attachment: ${source.name}`);
              if (typeof window.platform?.writeFileBinary !== 'function') {
                throw new Error('writeFileBinary unavailable');
              }
              const base64 = arrayBufferToBase64(await source.file.arrayBuffer());
              const ok = await window.platform.writeFileBinary(plan.attachmentPath, base64);
              if (ok === false) throw new Error(`failed to write attachment: ${source.name}`);
            }
            markdown.push(plan.markdown);
          }
          return markdown.join('\n');
        } : undefined,
        async applyCoverDrop(dataTransfer) {
          await applyMarkdownCoverImageDrop({
            filePath,
            target: remoteTarget,
            dataTransfer,
          });
        },
        onError(error) {
          showSaveError('preview.markdownAttachmentInsertFailed', error);
        },
      };
    }, [filePath, remoteContentRef]);

    const policy = useMemo<MarkdownEditorSurfacePolicy>(() => ({
      save: {
        scopeKey: filePath ?? remoteContentRef?.contentPath ?? 'preview:detached',
        mode: 'autosave',
        delayMs: SAVE_DELAY,
        checkpointIntervalMs: CHECKPOINT_INTERVAL,
        checkpoint,
        execute,
        onError(error) {
          showSaveError(
            error.code === 'conflict' ? 'settings.fileChangedOnDisk' : 'settings.saveFailed',
            error.cause ?? error.code,
          );
        },
      },
      attachment,
      openLink: {
        async open(url) {
          await openInternalLink(url, {
            origin: 'desk',
            baseFilePath: filePath,
          });
        },
      },
      contentGate: ({ content }) => ({ allowed: true, content }),
    }), [attachment, checkpoint, execute, filePath, remoteContentRef?.contentPath]);

    return (
      <MarkdownEditorSurface
        {...props}
        ref={ref}
        filePath={filePath}
        remoteContentRef={remoteContentRef}
        policy={policy}
      />
    );
  },
);
