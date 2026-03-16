"use client";

import { useState, useRef, useCallback } from "react";

interface UploadItem {
  id: string;
  file: File;
  preview: string;
  contextNote: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

export default function CapturePage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [siteId, setSiteId] = useState<string>("");
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load sites on mount
  const loadSites = useCallback(async () => {
    if (loaded) return;
    try {
      const res = await fetch("/api/sites");
      if (res.ok) {
        const data = await res.json();
        setSites(data.sites || []);
        if (data.sites?.length === 1) {
          setSiteId(data.sites[0].id);
        }
      }
    } catch { /* ignore */ }
    setLoaded(true);
  }, [loaded]);

  // Load on first render
  if (!loaded) loadSites();

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const newItems: UploadItem[] = Array.from(fileList).map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : "",
      contextNote: "",
      status: "pending" as const,
    }));
    setItems((prev) => [...prev, ...newItems]);
  }

  function updateNote(id: string, note: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, contextNote: note } : item))
    );
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.id !== id);
    });
  }

  async function uploadItem(item: UploadItem) {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: "uploading" } : i))
    );

    try {
      // 1. Get presigned URL
      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteId,
          content_type: item.file.type,
          filename: item.file.name,
        }),
      });

      if (!presignRes.ok) {
        const err = await presignRes.json();
        throw new Error(err.error || "Failed to get upload URL");
      }

      const { upload_url, public_url, media_type } = await presignRes.json();

      // 2. Upload file directly to R2
      const uploadRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": item.file.type },
        body: item.file,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.status}`);
      }

      // 3. Register asset in DB
      const assetRes = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteId,
          storage_url: public_url,
          media_type,
          context_note: item.contextNote || null,
        }),
      });

      if (!assetRes.ok) {
        const err = await assetRes.json();
        throw new Error(err.error || "Failed to register asset");
      }

      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "done" } : i))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: "error", error: message } : i
        )
      );
    }
  }

  async function uploadAll() {
    const pending = items.filter((i) => i.status === "pending");
    for (const item of pending) {
      await uploadItem(item);
    }
  }

  const pending = items.filter((i) => i.status === "pending");
  const hasItems = items.length > 0;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-lg font-semibold">Capture</h1>
      <p className="mb-6 text-sm text-muted">Upload photos and videos to your media library</p>

      {/* Site selector */}
      {sites.length > 1 && (
        <div className="mb-4">
          <label className="mb-1 block text-xs text-muted">Site</label>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">Select a site</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Capture buttons */}
      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
        <button
          onClick={() => {
            if (fileRef.current) {
              fileRef.current.removeAttribute("capture");
              fileRef.current.setAttribute("accept", "image/*,video/*");
              fileRef.current.click();
            }
          }}
          className="rounded-lg border border-border px-2 py-4 text-sm font-medium transition-colors hover:bg-surface active:bg-surface-hover sm:px-4"
        >
          <span className="mb-1 block text-2xl">▣</span>
          Library
        </button>
        <button
          onClick={() => {
            if (fileRef.current) {
              fileRef.current.setAttribute("capture", "environment");
              fileRef.current.setAttribute("accept", "image/*");
              fileRef.current.click();
            }
          }}
          className="rounded-lg border border-border px-2 py-4 text-sm font-medium transition-colors hover:bg-surface active:bg-surface-hover sm:px-4"
        >
          <span className="mb-1 block text-2xl">◉</span>
          Photo
        </button>
        <button
          onClick={() => {
            if (fileRef.current) {
              fileRef.current.setAttribute("capture", "environment");
              fileRef.current.setAttribute("accept", "video/*");
              fileRef.current.click();
            }
          }}
          className="rounded-lg border border-border px-2 py-4 text-sm font-medium transition-colors hover:bg-surface active:bg-surface-hover sm:px-4"
        >
          <span className="mb-1 block text-2xl">▶</span>
          Video
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Upload queue */}
      {hasItems && (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg border p-3 ${
                item.status === "done"
                  ? "border-success/30 bg-success/5"
                  : item.status === "error"
                  ? "border-danger/30 bg-danger/5"
                  : "border-border bg-surface"
              }`}
            >
              <div className="mb-2 flex items-start gap-3">
                {item.preview ? (
                  <img
                    src={item.preview}
                    alt=""
                    className="h-16 w-16 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded bg-surface-hover text-xs text-muted">
                    {item.file.type.startsWith("video/") ? "▶" : "▣"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.file.name}</p>
                  <p className="text-xs text-muted">
                    {(item.file.size / 1024 / 1024).toFixed(1)} MB
                    {item.status === "uploading" && " — uploading..."}
                    {item.status === "done" && " — uploaded"}
                    {item.status === "error" && ` — ${item.error}`}
                  </p>
                </div>
                {item.status === "pending" && (
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-xs text-muted hover:text-foreground"
                  >
                    ✕
                  </button>
                )}
              </div>
              {item.status === "pending" && (
                <input
                  type="text"
                  value={item.contextNote}
                  onChange={(e) => updateNote(item.id, e.target.value)}
                  placeholder="Context note (optional) — e.g. 'heel work at park'"
                  className="w-full rounded border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-accent"
                />
              )}
            </div>
          ))}

          {pending.length > 0 && siteId && (
            <div className="sticky bottom-4 pt-2">
              <button
                onClick={uploadAll}
                className="w-full rounded-lg bg-accent px-4 py-4 text-base font-medium text-white shadow-lg transition-colors hover:bg-accent-hover active:bg-accent-hover"
              >
                Upload {pending.length} {pending.length === 1 ? "file" : "files"}
              </button>
            </div>
          )}

          {pending.length > 0 && !siteId && (
            <p className="text-center text-xs text-warning">Select a site to upload</p>
          )}
        </div>
      )}

      {!hasItems && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-8 py-16 text-center">
          <span className="mb-3 text-3xl">◉</span>
          <p className="text-xs text-muted">
            Snap a photo, record a clip, or choose from your camera roll
          </p>
        </div>
      )}
    </div>
  );
}
