"use client";

import { useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { OnboardingTip } from "@/components/onboarding-tip";
import { useUpload } from "@/components/upload-provider";

interface StagedItem {
  id: string;
  file?: File;
  sourceUrl?: string;
  preview: string;
  contextNote: string;
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
  const { enqueue, uploading } = useUpload();

  const [items, setItems] = useState<StagedItem[]>([]);
  const [siteId, setSiteId] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // Resolve site from session
  const loadSite = useCallback(async () => {
    if (loaded) return;
    try {
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const data = await res.json();
        if (data.activeSiteId) setSiteId(data.activeSiteId);
      }
    } catch { /* ignore */ }
    setLoaded(true);
  }, [loaded]);

  if (!loaded) loadSite();

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const newItems: StagedItem[] = Array.from(fileList).map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      contextNote: "",
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
    }]);
    setUrlInput("");
    setShowUrlInput(false);
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.file && item.preview) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.id !== id);
    });
  }

  function uploadAll() {
    if (!siteId || items.length === 0) return;

    // Enqueue to global background upload queue
    enqueue(
      items.map((item) => ({
        file: item.file,
        sourceUrl: item.sourceUrl,
        contextNote: item.contextNote,
        siteId,
        projectId: projectId || null,
        fileName: item.file?.name || item.sourceUrl || "Unknown",
      }))
    );

    // Clear staged items — revoke object URLs
    for (const item of items) {
      if (item.file && item.preview) URL.revokeObjectURL(item.preview);
    }
    setItems([]);
  }

  const hasItems = items.length > 0;

  return (
    <div
      className="p-4 max-w-2xl"
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

      {uploading && (
        <div className="mb-4 flex items-center gap-2 rounded bg-surface-hover px-4 py-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          <p className="text-xs text-muted">Upload in progress</p>
        </div>
      )}

      {/* Capture buttons */}
      <div className="mb-6 grid grid-cols-4 gap-2">
        <button
          onClick={() => {
            if (fileRef.current) {
              fileRef.current.removeAttribute("capture");
              fileRef.current.setAttribute("accept", "image/*,video/*,.pdf");
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
        accept="image/*,video/*,.pdf"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Staging queue */}
      {hasItems && (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="border border-border bg-surface p-3">
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
                  </p>
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-xs text-muted hover:text-foreground"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          {siteId && (
            <div className="sticky bottom-4 pt-2">
              <button
                onClick={uploadAll}
                className="w-full bg-accent px-4 py-4 text-base font-medium text-white transition-colors hover:bg-accent-hover active:bg-accent-hover"
              >
                Upload {items.length} {items.length === 1 ? "file" : "files"}
              </button>
            </div>
          )}

          {!siteId && (
            <p className="text-center text-xs text-warning">Select a site first from the header</p>
          )}
        </div>
      )}

      {/* Drop zone / empty state */}
      {!hasItems && (
        <div
          className={`flex flex-col items-center justify-center border border-dashed px-8 py-16 text-center transition-colors ${
            dragging ? "border-accent bg-accent/5" : "border-border"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
          <div className="border-2 border-dashed border-accent p-12 text-center">
            <span className="mb-3 block text-4xl">◎</span>
            <p className="text-sm font-medium">Drop files to add to queue</p>
          </div>
        </div>
      )}
    </div>
  );
}
