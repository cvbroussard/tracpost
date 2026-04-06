"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

export interface UploadItem {
  id: string;
  file?: File;
  sourceUrl?: string;
  contextNote: string;
  siteId: string;
  projectId?: string | null;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  fileName: string;
}

interface WorkerItem {
  id: string;
  fileName: string;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
}

interface UploadContextType {
  items: WorkerItem[];
  enqueue: (items: Omit<UploadItem, "id" | "status">[]) => void;
  clear: () => void;
  activeCount: number;
  doneCount: number;
  errorCount: number;
}

const UploadContext = createContext<UploadContextType>({
  items: [],
  enqueue: () => {},
  clear: () => {},
  activeCount: 0,
  doneCount: 0,
  errorCount: 0,
});

export function useUpload() {
  return useContext(UploadContext);
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<WorkerItem[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const swReady = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Register the upload service worker
    navigator.serviceWorker.register("/upload-sw.js", { scope: "/" }).then((reg) => {
      swReady.current = true;

      // Request status once active
      const sw = reg.active || reg.installing || reg.waiting;
      if (sw?.state === "activated") {
        sw.postMessage({ type: "upload-status" });
      } else {
        sw?.addEventListener("statechange", function handler() {
          if (sw.state === "activated") {
            sw.postMessage({ type: "upload-status" });
            sw.removeEventListener("statechange", handler);
          }
        });
      }
    }).catch((err) => {
      console.warn("Upload service worker registration failed:", err);
    });

    // Listen for messages from the service worker
    function handleMessage(event: MessageEvent) {
      const msg = event.data;
      if (msg.type === "upload-progress") {
        setItems(msg.items);
        setActiveCount(msg.activeCount);
        setDoneCount(msg.doneCount);
        setErrorCount(msg.errorCount);
      }
    }

    navigator.serviceWorker.addEventListener("message", handleMessage);

    // Request status on mount (reconnect after navigation)
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "upload-status" });
    }

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, []);

  const enqueue = useCallback(async (newItems: Omit<UploadItem, "id" | "status">[]) => {
    const sw = navigator.serviceWorker?.controller;
    if (!sw) return;

    // Convert File objects to ArrayBuffers
    const prepared = await Promise.all(
      newItems.map(async (item) => {
        const id = crypto.randomUUID();
        if (item.file) {
          const buffer = await item.file.arrayBuffer();
          return {
            id,
            fileData: buffer,
            fileType: item.file.type,
            fileName: item.fileName,
            contextNote: item.contextNote,
            siteId: item.siteId,
            projectId: item.projectId || null,
          };
        }
        return {
          id,
          sourceUrl: item.sourceUrl,
          fileName: item.fileName,
          contextNote: item.contextNote,
          siteId: item.siteId,
          projectId: item.projectId || null,
        };
      })
    );

    const transferables = prepared
      .filter((p): p is typeof p & { fileData: ArrayBuffer } => !!(p as Record<string, unknown>).fileData)
      .map((p) => p.fileData);

    sw.postMessage(
      { type: "upload-enqueue", items: prepared },
      transferables
    );
  }, []);

  const clear = useCallback(() => {
    navigator.serviceWorker?.controller?.postMessage({ type: "upload-clear" });
  }, []);

  return (
    <UploadContext.Provider value={{ items, enqueue, clear, activeCount, doneCount, errorCount }}>
      {children}
    </UploadContext.Provider>
  );
}
