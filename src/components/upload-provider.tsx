"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

export interface UploadItem {
  id: string;
  file?: File;
  sourceUrl?: string;
  contextNote: string;
  /**
   * Subscriber-declared: was this asset generated or modified by AI?
   * Defaults to false. Per #161 (upload-side AI detection), we'll add C2PA
   * auto-detection in Phase 2 — for now this is the explicit subscriber
   * toggle from the upload form. Propagates to media_assets.metadata.ai_generated
   * which #160 reads at publish time for platform compliance flags.
   */
  aiGenerated: boolean;
  siteId: string;
  projectId?: string | null;
  fileName: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

interface UploadContextType {
  /** Items being uploaded (browser-side R2 PUT + asset POST) */
  items: UploadItem[];
  /** Enqueue files — starts uploading immediately, shows overlay */
  enqueue: (items: Omit<UploadItem, "id" | "status">[]) => void;
  /** Number of assets waiting for server-side processing (triage, EXIF, etc.) */
  pendingProcessing: number;
  /** Whether browser uploads are in progress */
  uploading: boolean;
}

const UploadContext = createContext<UploadContextType>({
  items: [],
  enqueue: () => {},
  pendingProcessing: 0,
  uploading: false,
});

export function useUpload() {
  return useContext(UploadContext);
}

function guessMediaType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.match(/\.(mp4|mov|avi|webm|mkv)/)) return "video/mp4";
  if (lower.match(/\.(gif)/)) return "image/gif";
  if (lower.match(/\.(png)/)) return "image/png";
  if (lower.match(/\.(webp)/)) return "image/webp";
  if (lower.match(/\.(pdf)/)) return "application/pdf";
  return "image/jpeg";
}

const POLL_KEY = "tp_upload_poll";

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [pendingProcessing, setPendingProcessing] = useState(0);
  const processing = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for server-side processing status (assets at 'pending_briefing')
  useEffect(() => {
    const siteId = localStorage.getItem(POLL_KEY);
    if (siteId) {
      startPolling(siteId);
    }
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  function startPolling(siteId: string) {
    if (pollTimer.current) clearInterval(pollTimer.current);
    localStorage.setItem(POLL_KEY, siteId);

    async function poll() {
      try {
        // Per #157: status renamed `received` → `pending_briefing`. Polling
        // surfaces assets that haven't yet been briefed so the UI can prompt
        // the subscriber to caption them.
        const res = await fetch(`/api/assets?site_id=${siteId}&status=pending_briefing`);
        if (res.ok) {
          const data = await res.json();
          const count = data.assets?.length || 0;
          setPendingProcessing(count);
          if (count === 0) {
            // All processed — stop polling
            localStorage.removeItem(POLL_KEY);
            if (pollTimer.current) clearInterval(pollTimer.current);
            pollTimer.current = null;
          }
        }
      } catch { /* ignore */ }
    }

    poll(); // Immediate first check
    pollTimer.current = setInterval(poll, 10000); // Every 10 seconds
  }

  // Process upload queue
  // Trigger server processing when batch completes
  const prevUploading = useRef(false);
  useEffect(() => {
    const isUploading = items.some((i) => i.status === "pending" || i.status === "uploading");
    if (prevUploading.current && !isUploading && items.length > 0) {
      // Batch just finished — trigger server-side processing
      const siteId = items.find((i) => i.siteId)?.siteId;
      if (siteId) {
        fetch("/api/pipeline/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site_id: siteId }),
        }).catch(() => {});
      }
    }
    prevUploading.current = isUploading;
  }, [items]);

  // Process upload queue
  useEffect(() => {
    if (processing.current) return;
    const next = items.find((i) => i.status === "pending");
    if (!next) return;

    processing.current = true;

    (async () => {
      setItems((prev) =>
        prev.map((i) => (i.id === next.id ? { ...i, status: "uploading" as const } : i))
      );

      try {
        if (next.sourceUrl) {
          const res = await fetch("/api/assets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              site_id: next.siteId,
              storage_url: next.sourceUrl,
              media_type: guessMediaType(next.sourceUrl),
              context_note: next.contextNote || null,
              project_id: next.projectId || null,
              ai_generated: next.aiGenerated,
              source: "url",
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed");
        } else if (next.file) {
          const contentType = next.file.type
            || (next.file.name.toLowerCase().endsWith(".heic") ? "image/heic" : "")
            || (next.file.name.toLowerCase().endsWith(".heif") ? "image/heic" : "")
            || "image/jpeg";

          const presignRes = await fetch("/api/upload/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              site_id: next.siteId,
              content_type: contentType,
              filename: next.file.name,
            }),
          });
          if (!presignRes.ok) {
            const err = await presignRes.json();
            throw new Error(err.error || "Presign failed");
          }

          const { upload_url, public_url, media_type } = await presignRes.json();

          const uploadRes = await fetch(upload_url, {
            method: "PUT",
            headers: { "Content-Type": contentType },
            body: next.file,
          });
          if (!uploadRes.ok) throw new Error(`R2 upload failed: ${uploadRes.status}`);

          const assetRes = await fetch("/api/assets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              site_id: next.siteId,
              storage_url: public_url,
              media_type,
              context_note: next.contextNote || null,
              project_id: next.projectId || null,
              ai_generated: next.aiGenerated,
            }),
          });
          const assetData = await assetRes.json();
          if (!assetRes.ok) throw new Error(assetData.error || "Register failed");
        }

        setItems((prev) =>
          prev.map((i) => (i.id === next.id ? { ...i, status: "done" as const } : i))
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setItems((prev) =>
          prev.map((i) => (i.id === next.id ? { ...i, status: "error" as const, error: message } : i))
        );
      }

      processing.current = false;
    })();
  }, [items]);

  const enqueue = useCallback((newItems: Omit<UploadItem, "id" | "status">[]) => {
    const withIds: UploadItem[] = newItems.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      status: "pending" as const,
    }));
    setItems((prev) => [...prev, ...withIds]);

    // Start polling for server-side processing once uploads begin
    if (newItems.length > 0 && newItems[0].siteId) {
      startPolling(newItems[0].siteId);
    }
  }, []);

  const uploading = items.some((i) => i.status === "pending" || i.status === "uploading");

  return (
    <UploadContext.Provider value={{ items, enqueue, pendingProcessing, uploading }}>
      {children}
    </UploadContext.Provider>
  );
}
