import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  KnowledgeResourceAddress,
} from "../../../../../shared/knowledge-workspace-contract.ts";
import {
  decodeSafeAssetText,
  evaluateResourceOpenPolicy,
  type ResourceOpenKind,
  type ResourceOpenPolicyReason,
} from "../../../../../lib/knowledge-workspace/resource-open-policy.ts";
import {
  KnowledgeWorkspaceClientError,
  knowledgeWorkspaceClient,
  type KnowledgeWorkspaceClient,
  type RendererResourceVersion,
} from "../../services/knowledge-workspace-client";
import {
  retainKnowledgeSourceWatch,
  subscribeKnowledgeResourceTreeChanges,
  type KnowledgeResourceTreeChangeSignal,
} from "../../services/resource-events";
import {
  base64FromBytes,
  bytesFromBase64,
} from "../../utils/base64-bytes";
import styles from "./KnowledgeWorkspace.module.css";

export type KnowledgeAssetViewerChangeSignal =
  KnowledgeResourceTreeChangeSignal;

type ViewerState =
  | { status: "loading" }
  | {
      status: "missing";
      sizeBytes: number | null;
      reason: "resource_missing";
    }
  | {
      status: "file-info";
      sizeBytes: number | null;
      reason: ResourceOpenPolicyReason;
      version?: RendererResourceVersion;
    }
  | {
      status: "ready";
      kind: Exclude<ResourceOpenKind, "missing" | "file-info">;
      sizeBytes: number;
      mimeType: string;
      version?: RendererResourceVersion;
      bytes?: Uint8Array;
      text?: string;
      encoding?: string;
    }
  | {
      status: "error";
      code: string;
    };

type WatchSource = (sourceKey: string) => () => void;
type SubscribeToChanges = (
  listener: (signal: KnowledgeAssetViewerChangeSignal) => void,
) => () => void;

export interface KnowledgeAssetViewerProps {
  address: KnowledgeResourceAddress;
  sourceName?: string;
  client?: KnowledgeWorkspaceClient;
  openDefault?: (address: KnowledgeResourceAddress) => Promise<unknown> | unknown;
  watchSource?: WatchSource;
  subscribeToChanges?: SubscribeToChanges;
  refreshDelayMs?: number;
}

function tr(
  key: string,
  vars?: Record<string, string | number>,
): string {
  return window.t?.(key, vars) ?? key;
}

function fileNameFromAddress(address: KnowledgeResourceAddress): string {
  return address.relativePath.split("/").at(-1) ?? address.relativePath;
}

function useAssetUrl(
  bytes: Uint8Array | undefined,
  mimeType: string | undefined,
): string | null {
  const source = useMemo(() => {
    if (!bytes || !mimeType) return null;
    if (typeof URL.createObjectURL === "function") {
      try {
        const ownedBuffer = bytes.slice().buffer as ArrayBuffer;
        return {
          url: URL.createObjectURL(new Blob([ownedBuffer], { type: mimeType })),
          revoke: true,
        };
      } catch {
        // A deterministic data URL remains scoped to the inert media element.
      }
    }
    return {
      url: `data:${mimeType};base64,${base64FromBytes(bytes)}`,
      revoke: false,
    };
  }, [bytes, mimeType]);

  useEffect(() => () => {
    if (source?.revoke) URL.revokeObjectURL(source.url);
  }, [source]);

  return source?.url ?? null;
}

function safeSize(version: RendererResourceVersion | undefined): number | null {
  return Number.isSafeInteger(version?.size) && Number(version?.size) >= 0
    ? Number(version?.size)
    : null;
}

function formatBytes(sizeBytes: number | null): string {
  if (sizeBytes === null) return tr("knowledge.asset.unknownSize");
  return new Intl.NumberFormat(undefined).format(sizeBytes);
}

function errorCode(error: unknown): string {
  return error instanceof KnowledgeWorkspaceClientError
    ? error.code
    : "knowledge_resource_unavailable";
}

export function KnowledgeAssetViewer({
  address,
  sourceName,
  client = knowledgeWorkspaceClient,
  openDefault,
  watchSource = retainKnowledgeSourceWatch,
  subscribeToChanges = subscribeKnowledgeResourceTreeChanges,
  refreshDelayMs = 120,
}: KnowledgeAssetViewerProps) {
  const [state, setState] = useState<ViewerState>({ status: "loading" });
  const [nativeError, setNativeError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const pendingViewContextRef = useRef<{
    scrollTop: number;
    mediaTime: number | null;
  } | null>(null);
  const addressKey = `${address.sourceKey}\u0000${address.relativePath}`;
  const requestAddress = useMemo<KnowledgeResourceAddress>(() => ({
    sourceKey: address.sourceKey,
    relativePath: address.relativePath,
  }), [address.relativePath, address.sourceKey]);
  const fileName = fileNameFromAddress(requestAddress);

  const load = useCallback(async (preserveViewContext = false) => {
    if (preserveViewContext) {
      const mediaTime = mediaRef.current?.currentTime;
      pendingViewContextRef.current = {
        scrollTop: scrollRef.current?.scrollTop ?? 0,
        mediaTime: Number.isFinite(mediaTime) ? Number(mediaTime) : null,
      };
    } else {
      pendingViewContextRef.current = null;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setNativeError(null);
    setState({ status: "loading" });

    try {
      const stat = await client.resources.stat(requestAddress, {
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestIdRef.current !== requestId) return;

      const sizeBytes = safeSize(stat.version);
      const decision = evaluateResourceOpenPolicy({
        fileName,
        exists: stat.exists,
        isDirectory: stat.isDirectory,
        sizeBytes,
      });

      if (decision.kind === "missing") {
        setState({
          status: "missing",
          sizeBytes,
          reason: "resource_missing",
        });
        return;
      }
      if (!decision.shouldRead || decision.kind === "file-info") {
        setState({
          status: "file-info",
          sizeBytes,
          reason: decision.reason ?? "unsupported_type",
          ...(stat.version ? { version: stat.version } : {}),
        });
        return;
      }

      const read = await client.resources.read(requestAddress, {
        encoding: "base64",
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestIdRef.current !== requestId) return;
      const bytes = read.encoding === "base64"
        ? bytesFromBase64(read.content)
        : null;
      if (!bytes || bytes.byteLength !== sizeBytes) {
        setState({
          status: "error",
          code: "knowledge_version_conflict",
        });
        return;
      }

      if (decision.kind === "text") {
        const decoded = decodeSafeAssetText(bytes);
        if (!decoded.ok) {
          setState({
            status: "file-info",
            sizeBytes,
            reason: decoded.reason,
            ...(read.version ? { version: read.version } : {}),
          });
          return;
        }
        setState({
          status: "ready",
          kind: "text",
          sizeBytes,
          mimeType: "text/plain;charset=utf-8",
          text: decoded.content,
          encoding: decoded.encoding,
          ...(read.version ? { version: read.version } : {}),
        });
        return;
      }

      setState({
        status: "ready",
        kind: decision.kind,
        sizeBytes,
        mimeType: decision.mimeType ?? "application/octet-stream",
        bytes,
        ...(read.version ? { version: read.version } : {}),
      });
    } catch (error) {
      if (controller.signal.aborted || requestIdRef.current !== requestId) return;
      setState({
        status: "error",
        code: errorCode(error),
      });
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }, [client, fileName, requestAddress]);

  useEffect(() => {
    void load(false);
    return () => {
      requestIdRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [addressKey, load]);

  useEffect(() => {
    const releaseWatch = watchSource(address.sourceKey);
    const unsubscribe = subscribeToChanges(() => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        void load(true);
      }, Math.max(0, refreshDelayMs));
    });
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      unsubscribe();
      releaseWatch();
    };
  }, [
    address.sourceKey,
    load,
    refreshDelayMs,
    subscribeToChanges,
    watchSource,
  ]);

  useEffect(() => {
    const context = pendingViewContextRef.current;
    if (!context || state.status === "loading") return;
    if (scrollRef.current) scrollRef.current.scrollTop = context.scrollTop;
  }, [state]);

  const assetUrl = useAssetUrl(
    state.status === "ready" ? state.bytes : undefined,
    state.status === "ready" ? state.mimeType : undefined,
  );

  const handleOpenDefault = useCallback(async () => {
    setNativeError(null);
    if (!openDefault) {
      setNativeError("knowledge_native_capability_unavailable");
      return;
    }
    try {
      await openDefault(requestAddress);
    } catch (error) {
      setNativeError(errorCode(error));
    }
  }, [openDefault, requestAddress]);

  const restoreMediaTime = useCallback(() => {
    const time = pendingViewContextRef.current?.mediaTime;
    const media = mediaRef.current;
    if (!media || time === null || time === undefined || !Number.isFinite(time)) {
      return;
    }
    try {
      media.currentTime = media.duration && Number.isFinite(media.duration)
        ? Math.min(time, media.duration)
        : time;
    } catch {
      // A codec may reject seeks until it has more metadata; the preview stays usable.
    }
  }, []);

  const handlePreviewError = useCallback(() => {
    setState({
      status: "error",
      code: "knowledge_resource_unavailable",
    });
  }, []);

  return (
    <section
      aria-label={tr("knowledge.asset.label")}
      className={styles.assetViewer}
      data-knowledge-asset-error={state.status === "error" ? state.code : undefined}
      data-knowledge-asset-status={state.status}
      data-knowledge-asset-viewer=""
      role="region"
      tabIndex={0}
    >
      <header className={styles.assetViewerHeader}>
        <div className={styles.assetViewerIdentity}>
          <h1 className={styles.assetViewerTitle}>{fileName}</h1>
          <span className={styles.assetViewerAddress}>
            {address.sourceKey}:{address.relativePath}
          </span>
        </div>
        <button
          className={styles.assetViewerButton}
          onClick={() => void handleOpenDefault()}
          type="button"
        >
          {tr("knowledge.asset.openDefault")}
        </button>
      </header>

      {nativeError && (
        <p className={styles.assetViewerAlert} role="alert">
          {nativeError === "knowledge_native_capability_unavailable"
            ? tr("knowledge.asset.nativeUnavailable")
            : tr("knowledge.asset.openDefaultError")}
        </p>
      )}

      <div
        aria-busy={state.status === "loading"}
        className={styles.assetViewerScroll}
        data-testid="knowledge-asset-scroll"
        ref={scrollRef}
      >
        {state.status === "loading" && (
          <p className={styles.assetViewerStatus} role="status">
            {tr("knowledge.asset.loading")}
          </p>
        )}

        {state.status === "missing" && (
          <AssetUnavailable
            message={tr("knowledge.asset.missing")}
            onReload={() => void load(true)}
          />
        )}

        {state.status === "error" && (
          <AssetUnavailable
            message={tr("knowledge.asset.unavailable")}
            onReload={() => void load(true)}
          />
        )}

        {state.status === "file-info" && (
          <FileInformation
            address={requestAddress}
            fileName={fileName}
            reason={state.reason}
            sizeBytes={state.sizeBytes}
            sourceName={sourceName ?? requestAddress.sourceKey}
          />
        )}

        {state.status === "ready" && state.kind === "text" && (
          <pre
            aria-label={tr("knowledge.asset.textPreview")}
            aria-readonly="true"
            className={styles.assetTextPreview}
            data-testid="knowledge-asset-text"
            tabIndex={0}
          >
            <code>{state.text}</code>
          </pre>
        )}

        {state.status === "ready" && state.kind === "image" && assetUrl && (
          <div className={styles.assetMediaStage}>
            <img
              alt={fileName}
              className={styles.assetImage}
              data-knowledge-asset-kind="image"
              onError={handlePreviewError}
              src={assetUrl}
            />
          </div>
        )}

        {state.status === "ready" && state.kind === "pdf" && assetUrl && (
          <iframe
            className={styles.assetPdf}
            data-knowledge-asset-kind="pdf"
            onError={handlePreviewError}
            src={`${assetUrl}#toolbar=1&navpanes=0`}
            title={fileName}
          />
        )}

        {state.status === "ready" && state.kind === "audio" && assetUrl && (
          <div className={styles.assetMediaStage}>
            <audio
              className={styles.assetAudio}
              controls
              data-knowledge-asset-kind="audio"
              onError={handlePreviewError}
              onLoadedMetadata={restoreMediaTime}
              ref={(element) => {
                mediaRef.current = element;
              }}
              src={assetUrl}
            />
          </div>
        )}

        {state.status === "ready" && state.kind === "video" && assetUrl && (
          <div className={styles.assetMediaStage}>
            <video
              className={styles.assetVideo}
              controls
              data-knowledge-asset-kind="video"
              onError={handlePreviewError}
              onLoadedMetadata={restoreMediaTime}
              ref={(element) => {
                mediaRef.current = element;
              }}
              src={assetUrl}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function AssetUnavailable({
  message,
  onReload,
}: {
  message: string;
  onReload(): void;
}) {
  return (
    <div className={styles.assetViewerUnavailable}>
      <p>{message}</p>
      <button
        className={styles.assetViewerButton}
        onClick={onReload}
        type="button"
      >
        {tr("knowledge.asset.reload")}
      </button>
    </div>
  );
}

function FileInformation({
  address,
  fileName,
  reason,
  sizeBytes,
  sourceName,
}: {
  address: KnowledgeResourceAddress;
  fileName: string;
  reason: ResourceOpenPolicyReason;
  sizeBytes: number | null;
  sourceName: string;
}) {
  return (
    <div className={styles.assetFileInfo}>
      <h2>{tr("knowledge.asset.fileInfo")}</h2>
      <p className={styles.assetFileName}>{fileName}</p>
      <p>{tr(`knowledge.asset.reason.${reason}`)}</p>
      <dl className={styles.assetMetadata}>
        <div>
          <dt>{tr("knowledge.asset.sourceLabel")}</dt>
          <dd>{sourceName}</dd>
        </div>
        <div>
          <dt>{tr("knowledge.asset.addressLabel")}</dt>
          <dd>{address.relativePath}</dd>
        </div>
        <div>
          <dt>{tr("knowledge.asset.sizeLabel")}</dt>
          <dd>{formatBytes(sizeBytes)}</dd>
        </div>
      </dl>
    </div>
  );
}
