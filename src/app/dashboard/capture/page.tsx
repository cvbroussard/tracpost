"use client";

import { useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { OnboardingTip } from "@/components/onboarding-tip";

interface UploadItem {
  id: string;
  file?: File;
  sourceUrl?: string;
  preview: string;
  contextNote: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

export default function CapturePage() {
  return (
    <Suspense>
      <CaptureForm />
    </Suspense>
  );
}

function CaptureForm() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  const projectName = searchParams.get("projectName");

  const [items, setItems] = useState<UploadItem[]>([]);
  const [siteId, setSiteId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // Resolve site from session — no manual picker needed
  const loadSite = useCallback(async () => {
    if (loaded) return;
    try {
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const data = await res.json();
        if (data.activeSiteId) {
          setSiteId(data.activeSiteId);
        }
      }
    } catch { /* ignore */ }
    setLoaded(true);
  }, [loaded]);

  if (!loaded) loadSite();

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

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items?.length) setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    dragCounter.current = 0;
    handleFiles(e.dataTransfer.files);
  }

  function addUrlItem() {
    const url = urlInput.trim();
    if (!url) return;
    setItems((prev) => [...prev, {
      id: crypto.randomUUID(),
      sourceUrl: url,
      preview: url,
      contextNote: "",
      status: "pending",
    }]);
    setUrlInput("");
    setShowUrlInput(false);
  }

  function updateNote(id: string, note: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, contextNote: note } : item))
    );
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.file && item.preview) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.id !== id);
    });
  }

  async function uploadItem(item: UploadItem) {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: "uploading" } : i))
    );

    try {
      if (item.sourceUrl) {
        // URL-based upload — send URL directly to the asset API
        const assetRes = await fetch("/api/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            site_id: siteId,
            storage_url: item.sourceUrl,
            media_type: guessMediaType(item.sourceUrl),
            context_note: item.contextNote || null,
            source: "url",
          }),
        });

        const urlData = await assetRes.json();
        if (!assetRes.ok) {
          throw new Error(urlData.error || "Failed to register asset");
        }

        // Auto-tag to project if uploading from project context
        if (projectId && urlData.asset?.id) {
          await fetch(`/api/assets/${urlData.asset.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project_ids: [projectId] }),
          }).catch(() => {});
        }
      } else if (item.file) {
        // File-based upload — presign + upload to R2 + register
        const presignRes = await fetch("/api/upload/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            site_id: siteId,
            content_type: item.file.type
              || (item.file.name.toLowerCase().endsWith(".heic") ? "image/heic" : "")
              || (item.file.name.toLowerCase().endsWith(".heif") ? "image/heic" : ""),
            filename: item.file.name,
          }),
        });

        if (!presignRes.ok) {
          const err = await presignRes.json();
          throw new Error(err.error || "Failed to get upload URL");
        }

        const { upload_url, public_url, media_type } = await presignRes.json();

        const uploadRes = await fetch(upload_url, {
          method: "PUT",
          headers: { "Content-Type": item.file.type },
          body: item.file,
        });

        if (!uploadRes.ok) {
          throw new Error(`Upload failed: ${uploadRes.status}`);
        }

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

        const fileData = await assetRes.json();
        if (!assetRes.ok) {
          throw new Error(fileData.error || "Failed to register asset");
        }

        // Auto-tag to project if uploading from project context
        if (projectId && fileData.asset?.id) {
          await fetch(`/api/assets/${fileData.asset.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project_ids: [projectId] }),
          }).catch(() => {});
        }
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
    <div
      className="mx-auto max-w-lg"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <OnboardingTip
        tipKey="capture"
        message="The pipeline needs raw material. Upload 5+ photos or videos — training sessions, results, facility shots — and the AI handles triage, captioning, and scheduling."
        incomplete={true}
      />
      <h1 className="mb-1 text-lg font-semibold">Capture</h1>
      <p className="mb-6 text-sm text-muted">Upload photos and videos to your media library</p>

      {projectId && (
        <div className="mb-4 flex items-center justify-between rounded bg-accent/10 px-4 py-2">
          <p className="text-sm text-accent">
            Uploading to <strong>{projectName || "project"}</strong> — assets will be auto-tagged
          </p>
          <a href="/dashboard/capture" className="text-xs text-muted hover:text-foreground">Clear</a>
        </div>
      )}

      {/* Capture buttons */}
      <div className="mb-6 grid grid-cols-4 gap-2">
        <button
          onClick={() => {
            if (fileRef.current) {
              fileRef.current.removeAttribute("capture");
              fileRef.current.setAttribute("accept", "image/*,video/*");
              fileRef.current.click();
            }
          }}
          className="border border-border px-2 py-4 text-sm font-medium transition-colors hover:bg-surface active:bg-surface-hover"
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
          className="border border-border px-2 py-4 text-sm font-medium transition-colors hover:bg-surface active:bg-surface-hover"
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
          className="border border-border px-2 py-4 text-sm font-medium transition-colors hover:bg-surface active:bg-surface-hover"
        >
          <span className="mb-1 block text-2xl">▶</span>
          Video
        </button>
        <button
          onClick={() => setShowUrlInput(!showUrlInput)}
          className={`border px-2 py-4 text-sm font-medium transition-colors ${
            showUrlInput ? "border-accent text-accent" : "border-border hover:bg-surface active:bg-surface-hover"
          }`}
        >
          <span className="mb-1 block text-2xl">🔗</span>
          URL
        </button>
      </div>

      {/* URL input */}
      {showUrlInput && (
        <div className="mb-6 flex gap-2">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addUrlItem()}
            placeholder="Paste image or video URL"
            className="flex-1 text-sm"
            autoFocus
          />
          <button
            onClick={addUrlItem}
            disabled={!urlInput.trim()}
            className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

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
              className={`border p-3 ${
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
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded bg-surface-hover text-xs text-muted">
                    {item.file?.type.startsWith("video/") ? "▶" : item.sourceUrl ? "🔗" : "▣"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {item.file?.name || item.sourceUrl || "Unknown"}
                  </p>
                  <p className="text-xs text-muted">
                    {item.file ? `${(item.file.size / 1024 / 1024).toFixed(1)} MB` : "URL import"}
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
                  placeholder="Context note — e.g. 'Custom walnut island with knife storage'"
                  className="w-full text-xs"
                />
              )}
            </div>
          ))}

          {pending.length > 0 && siteId && (
            <div className="sticky bottom-4 pt-2">
              <button
                onClick={uploadAll}
                className="w-full bg-accent px-4 py-4 text-base font-medium text-white transition-colors hover:bg-accent-hover active:bg-accent-hover"
              >
                Upload {pending.length} {pending.length === 1 ? "file" : "files"}
              </button>
            </div>
          )}

          {pending.length > 0 && !siteId && (
            <p className="text-center text-xs text-warning">Select a site first from the header</p>
          )}
        </div>
      )}

      {/* Drop zone / empty state */}
      {!hasItems && (
        <div
          className={`flex flex-col items-center justify-center border border-dashed px-8 py-16 text-center transition-colors ${
            dragging
              ? "border-accent bg-accent/5"
              : "border-border"
          }`}
        >
          <span className="mb-3 text-3xl">{dragging ? "◎" : "◉"}</span>
          <p className="text-sm font-medium">
            {dragging ? "Drop files here" : "Drag & drop files here"}
          </p>
          <p className="mt-1 text-xs text-muted">
            or use the buttons above to browse, capture, or paste a URL
          </p>
        </div>
      )}

      {/* Drag overlay when items exist */}
      {hasItems && dragging && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80"
        >
          <div className="border-2 border-dashed border-accent p-12 text-center">
            <span className="mb-3 block text-4xl">◎</span>
            <p className="text-sm font-medium">Drop files to add to queue</p>
          </div>
        </div>
      )}
    </div>
  );
}

function guessMediaType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.match(/\.(mp4|mov|avi|webm|mkv)/)) return "video/mp4";
  if (lower.match(/\.(gif)/)) return "image/gif";
  if (lower.match(/\.(png)/)) return "image/png";
  if (lower.match(/\.(webp)/)) return "image/webp";
  return "image/jpeg";
}
