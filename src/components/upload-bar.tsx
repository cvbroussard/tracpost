"use client";

import { useRef, useState, useEffect } from "react";
import { useUpload } from "@/components/upload-provider";

/**
 * Streamlined upload bar — lives inline at the top of /dashboard/media.
 *
 * Three affordances:
 *   - Select Files (triggers file input, accepts multiple, immediate upload)
 *   - URL input (paste a link, immediate upload)
 *   - Project picker — when no projectId is passed via URL, subscriber
 *     can pick a project once and all subsequent uploads bind to it
 *     (per 2026-05-18 deliberate-binding architecture). Selection
 *     persists per (user, site) via /api/subscriber/picker so refresh
 *     and device-switch keep the last choice.
 *
 * Per the restructure: no staging queue, no per-item caption, no per-item
 * AI toggle, no drag/drop. Subscribers in the act of uploading are in
 * "get this done" mode — captioning + tagging happen in the asset modal
 * after the file lands.
 *
 * Project source of truth precedence:
 *   1. `projectId` prop (URL ?project=X — subscriber navigated from a
 *      project page; project is locked, picker hidden)
 *   2. Subscriber's last-picked project via /api/subscriber/picker
 *   3. None (uploads land unbound; bind later in asset modal)
 */
interface Project {
  id: string;
  name: string;
}

export function UploadBar({ siteId, projectId, projectName }: {
  siteId: string;
  projectId?: string | null;
  projectName?: string | null;
}) {
  const { enqueue, uploading } = useUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showUrl, setShowUrl] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  // URL-driven projectId trumps the picker (subscriber navigated from a
  // project page → context is explicit and locked).
  const urlLocksProject = Boolean(projectId);

  const [projects, setProjects] = useState<Project[]>([]);
  const [pickedProjectId, setPickedProjectId] = useState<string | null>(null);
  const [pickerLoading, setPickerLoading] = useState(true);

  // Load projects + last picker on mount. Skip when URL has already
  // locked a project — the picker UI doesn't render in that mode.
  useEffect(() => {
    if (urlLocksProject) {
      setPickerLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [projRes, pickerRes] = await Promise.all([
          fetch(`/api/projects?site_id=${siteId}`),
          fetch(`/api/subscriber/picker?site_id=${siteId}&kind=project`),
        ]);
        const projData = projRes.ok ? await projRes.json() : { projects: [] };
        const pickerData = pickerRes.ok ? await pickerRes.json() : { entity_id: null };
        if (!cancelled) {
          const list = (projData.projects || []) as Project[];
          setProjects(list);
          // Only honor stored pick if the project still exists.
          const stillExists = list.some((p) => p.id === pickerData.entity_id);
          setPickedProjectId(stillExists ? pickerData.entity_id : null);
        }
      } catch {
        // Non-fatal — subscriber can pick from a smaller list or none
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [siteId, urlLocksProject]);

  async function persistPick(nextId: string | null) {
    setPickedProjectId(nextId);
    try {
      await fetch("/api/subscriber/picker", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteId,
          picker_kind: "project",
          entity_id: nextId,
        }),
      });
    } catch {
      // Non-fatal — local state still reflects the pick for this session
    }
  }

  // Effective projectId for uploads: URL prop wins, then picker.
  const effectiveProjectId = projectId || pickedProjectId || null;
  const effectiveProjectName =
    projectName ||
    (pickedProjectId ? projects.find((p) => p.id === pickedProjectId)?.name : null) ||
    null;

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const items = Array.from(fileList).map((file) => ({
      file,
      contextNote: "",
      aiGenerated: false,
      siteId,
      projectId: effectiveProjectId,
      fileName: file.name,
    }));
    enqueue(items);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleUrl() {
    const url = urlInput.trim();
    if (!url) return;
    enqueue([{
      sourceUrl: url,
      contextNote: "",
      aiGenerated: false,
      siteId,
      projectId: effectiveProjectId,
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

      {/* URL-locked project: read-only pill (existing behavior preserved) */}
      {urlLocksProject && effectiveProjectName && (
        <span className="rounded bg-accent/10 px-2 py-1 text-[11px] text-accent">
          → {effectiveProjectName}
        </span>
      )}

      {/* In-bar project picker: only when URL hasn't pre-bound, and
          there are projects to pick from. Native <select> = mobile-
          and accessibility-friendly with zero dependencies. */}
      {!urlLocksProject && !pickerLoading && projects.length > 0 && (
        <label
          className="flex items-center gap-1.5 text-[11px] text-muted"
          title="All uploads in this session will bind to this project. Selection persists across refresh + device."
        >
          <span>Project:</span>
          <select
            value={pickedProjectId || ""}
            onChange={(e) => persistPick(e.target.value || null)}
            className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
          >
            <option value="">— None —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {pickedProjectId && (
            <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
              → bound
            </span>
          )}
        </label>
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
