import path from "path";
import { Type } from "../pi-sdk/index.ts";
import {
  createDocumentExtractionService,
  type DocumentExtractionServiceOptions,
} from "../document-extract/index.ts";
import { serializeSessionFile } from "../session-files/session-file-response.ts";
import { copyFileRefToPath, statFileRef } from "../file-ref/resource-io.ts";
import { getToolSessionPath } from "./tool-session.ts";

function refFromParams(params: any = {}, key = "ref") {
  const explicit = params[key] || null;
  if (explicit && typeof explicit === "object" && explicit.type) return explicit;
  if (params.fileId) {
    return {
      type: "session_file",
      fileId: params.fileId,
      ...(params.sessionId ? { sessionId: params.sessionId } : {}),
      ...(params.sessionPath ? { sessionPath: params.sessionPath } : {}),
    };
  }
  if (params.path) return { type: "path", path: params.path };
  throw new Error(`${key} requires fileId, path, or typed FileRef`);
}

function sourceFromParams(params: any = {}) {
  if (params.source && typeof params.source === "object") return params.source;
  return refFromParams(params, "source");
}

function targetFromParams(params: any = {}) {
  const target = params.target && typeof params.target === "object" ? params.target : {};
  return {
    targetPath: params.targetPath ?? target.path ?? target.targetPath ?? null,
    targetDir: params.targetDir ?? target.dir ?? target.targetDir ?? null,
    filename: params.filename ?? target.filename ?? null,
  };
}

function toMediaItem(file) {
  const fileId = file?.fileId || file?.id || null;
  if (!fileId) return null;
  return {
    type: "session_file",
    fileId,
    sessionId: file.sessionId,
    sessionPath: file.sessionPath,
    filePath: file.filePath,
    filename: file.filename || path.basename(file.filePath || ""),
    label: file.label || file.displayName || file.filename,
    mime: file.mime,
    size: file.size,
    kind: file.kind,
  };
}

function statText(file) {
  const type = file.isDirectory ? "directory" : "file";
  const size = file.size === null || file.size === undefined ? "unknown size" : `${file.size} bytes`;
  const modified = Number.isFinite(file.mtimeMs) ? new Date(file.mtimeMs).toISOString() : "unknown mtime";
  return `File stat: ${file.filename || file.label || file.filePath} (${type}, ${size}, modified ${modified}, ${file.status || "available"})`;
}

function copyText(filePath) {
  return `Copied file to ${filePath}`;
}

function errorResult(err) {
  return {
    content: [{ type: "text", text: err?.message || String(err) }],
    details: {},
  };
}

function extractionResourceFromParams(params: any = {}, sessionId: string | null, sessionPath: string | null) {
  if (params.resource && typeof params.resource === "object" && !Array.isArray(params.resource)) {
    return params.resource;
  }
  if (typeof params.fileId === "string" && params.fileId.trim()) {
    return {
      kind: "session-file",
      fileId: params.fileId.trim(),
      ...(sessionId ? { sessionId } : {}),
      ...(sessionPath ? { sessionPath } : {}),
    };
  }
  throw new Error("extract requires an authorized ResourceIO resource or fileId");
}

function extractionResult(result: any) {
  if (!result.ok) {
    return {
      content: [{ type: "text", text: result.message }],
      details: { extraction: { ok: false, reason: result.reason } },
    };
  }
  return {
    content: [{ type: "text", text: result.markdown }],
    details: {
      extraction: {
        ok: true,
        format: result.format,
        warnings: result.warnings,
        extractorVersion: result.extractorVersion,
      },
    },
  };
}

function extractionErrorResult(err: any) {
  if (err?.name === "AbortError") {
    return {
      content: [{ type: "text", text: "Document extraction cancelled." }],
      details: { extraction: { ok: false, reason: "parse-failed" } },
    };
  }
  return {
    content: [{ type: "text", text: "Document extraction could not read the authorized resource." }],
    details: { extraction: { ok: false, reason: "parse-failed" } },
  };
}

export function createFileTool({
  getCwd,
  getSessionPath,
  getAuthorizedFolders,
  resolveSessionFile,
  registerSessionFile,
  getResourceIO,
  documentExtractionOptions = {},
}: {
  getCwd?: any;
  getSessionPath?: any;
  getAuthorizedFolders?: any;
  resolveSessionFile?: any;
  registerSessionFile?: any;
  getResourceIO?: () => any;
  documentExtractionOptions?: Omit<DocumentExtractionServiceOptions, "resourceIO">;
} = {}) {
  return {
    name: "file",
    label: "File",
    description: "File operations: stat metadata, copy files into the workspace, or extract authorized documents into Markdown.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("stat"),
        Type.Literal("copy"),
        Type.Literal("extract"),
      ], {
        description: "File action to perform.",
      }),
      ref: Type.Optional(Type.Object({}, {
        description: "Typed FileRef for stat, such as { type: 'session_file', fileId } or { type: 'path', path }.",
        additionalProperties: true,
      } as any)),
      source: Type.Optional(Type.Object({}, {
        description: "Typed FileRef for copy source, such as { type: 'session_file', fileId } or { type: 'path', path }.",
        additionalProperties: true,
      } as any)),
      resource: Type.Optional(Type.Object({}, {
        description: "Authorized ResourceIO target for extract, such as { kind: 'session-file', fileId } or { kind: 'mount', mountId, path }.",
        additionalProperties: true,
      } as any)),
      target: Type.Optional(Type.Object({}, {
        description: "Copy target. v0 targets must resolve inside the current working directory.",
        additionalProperties: true,
      } as any)),
      fileId: Type.Optional(Type.String({
        description: "SessionFile id shorthand. Prefer this for files already produced or attached in the current session.",
      })),
      sessionId: Type.Optional(Type.String({
        description: "Stable sessionId that owns fileId. Prefer this over sessionPath when available.",
      })),
      sessionPath: Type.Optional(Type.String({
        description: "Legacy session JSONL path that owns fileId. Usually omit to use the current session.",
      })),
      path: Type.Optional(Type.String({
        description: "Workspace source path shorthand. Relative paths resolve from the current working directory.",
      })),
      formatHint: Type.Optional(Type.String({
        description: "Optional filename-only format hint for extract, such as report.pdf.",
      })),
      targetDir: Type.Optional(Type.String({
        description: "Copy destination directory. Relative paths resolve inside the current working directory.",
      })),
      targetPath: Type.Optional(Type.String({
        description: "Copy destination file path. Relative paths resolve inside the current working directory. Pass either targetPath or targetDir.",
      })),
      filename: Type.Optional(Type.String({
        description: "Optional destination filename when targetDir is used.",
      })),
      conflictPolicy: Type.Optional(Type.Union([
        Type.Literal("fail"),
        Type.Literal("rename"),
        Type.Literal("overwrite"),
      ], {
        description: "What to do when the copy target exists. Defaults to fail. Use rename to add a numeric suffix. Use overwrite only when explicitly requested.",
      })),
    }),
    execute: async (_toolCallId, params: any = {}, signal = null, _onUpdate = null, ctx: any = {}) => {
      const cwd = ctx?.sessionManager?.getCwd?.() || getCwd?.() || process.cwd();
      const sessionPath = params.sessionPath
        || getToolSessionPath(ctx)
        || ctx?.sessionPath
        || getSessionPath?.()
        || null;
      const sessionId = params.sessionId || ctx?.sessionId || null;
      const authorizedFolders = (() => {
        try {
          const folders = getAuthorizedFolders?.(sessionPath, ctx);
          return Array.isArray(folders) ? folders.filter((item) => typeof item === "string" && item.trim()) : [];
        } catch {
          return [];
        }
      })();
      const allowedRoots = [cwd, ...authorizedFolders];

      try {
        if (params.action === "stat") {
          const file = await statFileRef(refFromParams(params), {
            cwd,
            sessionId,
            sessionPath,
            resolveSessionFile,
          });
          return {
            content: [{ type: "text", text: statText(file) }],
            details: { file },
          };
        }

        if (params.action === "copy") {
          const target = targetFromParams(params);
          const copied = await copyFileRefToPath({
            from: sourceFromParams(params),
            targetPath: target.targetPath,
            targetDir: target.targetDir,
            filename: target.filename,
            conflictPolicy: params.conflictPolicy || "fail",
            cwd,
            allowedRoots,
            sourceAllowedRoots: allowedRoots,
            sessionId,
            sessionPath,
            resolveSessionFile,
            registerSessionFile,
          });
          const serialized = copied.sessionFile ? serializeSessionFile(copied.sessionFile) : null;
          const mediaItem = toMediaItem(serialized);
          return {
            content: [{ type: "text", text: copyText(copied.filePath) }],
            details: {
              filePath: copied.filePath,
              ...(serialized ? { file: serialized, sessionFile: serialized } : {}),
              ...(mediaItem ? { media: { items: [mediaItem], mediaUrls: [copied.filePath] } } : {}),
            },
          };
        }

        if (params.action === "extract") {
          const resourceIO = ctx?.resourceIO || getResourceIO?.();
          if (!resourceIO) {
            throw new Error("extract requires the ResourceIO kernel");
          }
          try {
            const extraction = createDocumentExtractionService({
              resourceIO,
              ...documentExtractionOptions,
            });
            const result = await extraction.extract({
              resource: extractionResourceFromParams(params, sessionId, sessionPath),
              ...(params.formatHint ? { filenameHint: params.formatHint } : {}),
              ...(signal ? { signal } : {}),
              context: {
                source: "agent_tool",
                reason: "document-extract",
                ...(sessionId ? { sessionId } : {}),
                ...(sessionPath ? { sessionPath } : {}),
                principal: {
                  kind: "agent",
                  ...(sessionId ? { sessionId } : {}),
                  ...(sessionPath ? { sessionPath } : {}),
                },
                auditRead: true,
              },
            });
            return extractionResult(result);
          } catch (err) {
            return extractionErrorResult(err);
          }
        }

        throw new Error(`unsupported file action: ${params.action || "unknown"}`);
      } catch (err) {
        return errorResult(err);
      }
    },
  };
}
