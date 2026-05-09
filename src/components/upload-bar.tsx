"use client";

import { useRef, useState } from "react";
import { useUpload } from "@/components/upload-provider";

/**
 * Streamlined upload bar — lives inline at the top of /dashboard/media.
 *
 * Two affordances only:
 *   - Select Files (triggers file input, accepts multiple, immediate upload)
 *   - URL input (paste a link, immediate upload)
 *
 * Per the restructure: no staging queue, no per-item caption, no per-item
 * AI toggle, no drag/drop. Subscribers in the act of uploading are in
 * "get this done" mode — captioning + tagging happen in the asset modal
 * after the file lands. The briefing-on-upload optimization (#166) was
 * built on a false premise that subscribers reliably caption while
 * uploading; in practice they don't, and the staging UI was friction.
 *
 * Project context comes via URL (?project=X) when subscriber navigates
 * from a project page — keeps the "upload these 10 photos to Carter"
 * flow working without an in-bar picker.
 */
export function UploadBar({ siteId, projectId, projectName }: {
  siteId: string;
  projectId?: string | null;
  projectName?: string | null;
}) {
  const { enqueue, uploading } = useUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showUrl, setShowUrl] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const items = Array.from(fileList).map((file) => ({
      file,
      contextNote: "",
      aiGenerated: false,
      siteId,
      projectId: projectId || null,
      fileName: file.name,
    }));
    enqueue(items);
    if (fileRef.current) fileRef.current.value = ""; // allow re-select same file
  }

  function handleUrl() {
    const url = urlInput.trim();
    if (!url) return;
    enqueue([{
      sourceUrl: url,
      contextNote: "",
      aiGenerated: false,
      siteId,
      projectId: projectId || null,
      fileName: url,
    }]);
    setUrlInput("");
    setShowUrl(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => fileRef.current?.click()}
        className="rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-hover"
        title="Select files from your device"
      >
        + Select files
      </button>
      <button
        onClick={() => setShowUrl(!showUrl)}
        className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
          showUrl
            ? "border-accent bg-accent/10 text-accent"
            : "border-border bg-surface text-muted hover:text-foreground"
        }`}
        title="Import from a public URL"
      >
        URL
      </button>
      {showUrl && (
        <div className="flex flex-1 items-center gap-1.5 min-w-[240px]">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUrl()}
            placeholder="Paste image or video URL"
            className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs"
            autoFocus
          />
          <button
            onClick={handleUrl}
            disabled={!urlInput.trim()}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
      {projectName && (
        <span className="rounded bg-accent/10 px-2 py-1 text-[11px] text-accent">
          → {projectName}
        </span>
      )}
      {uploading && (
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          Uploading…
        </span>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,.pdf"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
