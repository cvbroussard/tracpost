"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { TagPicker, type PillarGroup } from "./tag-picker";
import { FaceOverlay } from "./face-overlay";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

interface Brand {
  id: string;
  name: string;
  slug: string;
  url: string | null;
}

interface Project {
  id: string;
  name: string;
  slug: string;
}

interface AssetEditModalProps {
  assetId: string;
  siteId: string;
  imageUrl: string;
  mediaType: string;
  initialNote: string;
  initialPillar: string;
  initialTags: string[];
  pillarConfig: PillarGroup[];
  availablePillars?: string[];
  brands?: Brand[];
  projects?: Project[];
  brandLabel?: string | null;
  projectLabel?: string | null;
  initialBrandIds?: string[];
  initialProjectIds?: string[];
  personaLabel?: string | null;
  initialPersonaIds?: string[];
  source?: string | null;
  qualityScore?: number | null;
  sceneType?: string | null;
  captionSource?: string | null;
  faces?: Array<{
    box: { x: number; y: number; width: number; height: number };
    score: number;
    personaId: string | null;
    personaName: string | null;
    distance: number | null;
    embedding: number[];
    index: number;
  }> | null;
  faceDetectionWidth?: number;
  faceDetectionHeight?: number;
  personas?: Array<{ id: string; name: string; type: string }>;
  onClose: () => void;
  onSaved: (note: string, pillar: string, tags: string[], brandIds?: string[], projectIds?: string[], personaIds?: string[]) => void;
  onDeleted?: () => void;
  onBrandCreated?: (brand: Brand) => void;
  onProjectCreated?: (project: Project) => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export function AssetEditModal({
  assetId,
  siteId,
  imageUrl,
  mediaType,
  initialNote,
  initialPillar,
  initialTags,
  pillarConfig,
  brands = [],
  projects = [],
  brandLabel,
  projectLabel,
  initialBrandIds = [],
  initialProjectIds = [],
  personaLabel,
  initialPersonaIds = [],
  source,
  qualityScore,
  sceneType,
  captionSource,
  faces: initialFaces = null,
  faceDetectionWidth,
  faceDetectionHeight,
  personas: personaList = [],
  onClose,
  onSaved,
  onDeleted,
  onBrandCreated,
  onProjectCreated,
  onNext,
  onPrev,
  hasNext = false,
  hasPrev = false,
}: AssetEditModalProps) {
  const [faceData, setFaceData] = useState(initialFaces);
  const [note, setNote] = useState(initialNote);
  const [pillar, setPillar] = useState(initialPillar);
  const [tags, setTags] = useState<string[]>(initialTags || []);
  const [brandIds, setBrandIds] = useState<string[]>(initialBrandIds);
  const [projectIds, setProjectIds] = useState<string[]>(initialProjectIds);
  const [personaIds, setPersonaIds] = useState<string[]>(initialPersonaIds);

  // Reset state when navigating to a different asset
  useEffect(() => {
    setFaceData(initialFaces);
    setNote(initialNote);
    setPillar(initialPillar);
    setTags(initialTags || []);
    setBrandIds(initialBrandIds);
    setProjectIds(initialProjectIds);
    setPersonaIds(initialPersonaIds);
    speech.stop();
  }, [assetId]);
  const [localBrands, setLocalBrands] = useState(brands);
  const [localProjects, setLocalProjects] = useState(projects);
  const [newBrandName, setNewBrandName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<boolean | "replace">(false);
  const [deleting, setDeleting] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Speech recognition — cursor-aware insertion into context note
  const speech = useSpeechRecognition({
    onFinal: useCallback((transcript: string) => {
      const ta = textareaRef.current;
      if (!ta) {
        setNote((prev) => (prev ? prev + " " + transcript : transcript));
        return;
      }
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      setNote((prev) => {
        const before = prev.slice(0, start);
        const after = prev.slice(end);
        const spaceBefore = before.length > 0 && !before.endsWith(" ") ? " " : "";
        return before + spaceBefore + transcript + after;
      });
      requestAnimationFrame(() => {
        const newPos = start + (start > 0 ? 1 : 0) + transcript.length;
        ta.selectionStart = newPos;
        ta.selectionEnd = newPos;
        ta.focus();
      });
    }, []),
  });

  // Vendor hashtag autocomplete state
  const [hashQuery, setHashQuery] = useState<string | null>(null);
  const [hashIndex, setHashIndex] = useState(0);
  const [hashStart, setHashStart] = useState(0);

  // Hashtag autocomplete uses brands
  const hashMatches = hashQuery !== null
    ? localBrands.filter((v) =>
        v.slug.startsWith(hashQuery.toLowerCase()) ||
        v.name.toLowerCase().startsWith(hashQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  function handleNoteChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setNote(val);
    suggestFromNote(val);

    // Detect # autocomplete trigger
    const pos = e.target.selectionStart;
    const before = val.slice(0, pos);
    const hashMatch = before.match(/#([a-zA-Z0-9_]*)$/);
    if (hashMatch) {
      setHashQuery(hashMatch[1]);
      setHashStart(pos - hashMatch[0].length);
      setHashIndex(0);
    } else {
      setHashQuery(null);
    }
  }

  function handleNoteKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (hashQuery === null || hashMatches.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHashIndex((i) => Math.min(i + 1, hashMatches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHashIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertBrandTag(hashMatches[hashIndex]);
    } else if (e.key === "Escape") {
      setHashQuery(null);
    }
  }

  function insertBrandTag(brand: Brand) {
    const before = note.slice(0, hashStart);
    const after = note.slice(textareaRef.current?.selectionStart || hashStart + (hashQuery?.length || 0) + 1);
    const inserted = `#${brand.slug} `;
    const newNote = before + inserted + after;
    setNote(newNote);
    setHashQuery(null);

    // Auto-add brand to selection
    setBrandIds((prev) =>
      prev.includes(brand.id) ? prev : [...prev, brand.id]
    );

    // Restore cursor position
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = hashStart + inserted.length;
        textareaRef.current.selectionStart = pos;
        textareaRef.current.selectionEnd = pos;
        textareaRef.current.focus();
      }
    });
  }

  // Debounced AI tag suggestion
  const suggestFromNote = useCallback((text: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (text.length < 50) return;

    suggestTimer.current = setTimeout(async () => {
      setSuggesting(true);
      try {
        const res = await fetch("/api/suggest-tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId, contextNote: text }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.pillarId) setPillar(data.pillarId);
          if (data.tagIds?.length > 0) {
            // Merge new suggestions with existing — don't overwrite
            setTags((prev) => {
              const merged = new Set([...prev, ...data.tagIds]);
              return Array.from(merged);
            });
          }
        }
      } catch { /* ignore */ }
      setSuggesting(false);
    }, 800);
  }, [siteId]);

  async function quickCreateBrand() {
    if (!newBrandName.trim()) return;
    setCreatingBrand(true);
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newBrandName.trim(), site_id: siteId }),
      });
      if (res.ok) {
        const data = await res.json();
        setLocalBrands((prev) => [...prev, data.brand].sort((a: Brand, b: Brand) => a.name.localeCompare(b.name)));
        setBrandIds((prev) => [...prev, data.brand.id]);
        setNewBrandName("");
        onBrandCreated?.(data.brand);
      }
    } catch { /* ignore */ }
    setCreatingBrand(false);
  }

  async function quickCreateProject() {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim(), site_id: siteId }),
      });
      if (res.ok) {
        const data = await res.json();
        setLocalProjects((prev) => [...prev, data.project].sort((a: Project, b: Project) => a.name.localeCompare(b.name)));
        setProjectIds((prev) => [...prev, data.project.id]);
        setNewProjectName("");
        onProjectCreated?.(data.project);
      }
    } catch { /* ignore */ }
    setCreatingProject(false);
  }

  async function doSave(): Promise<boolean> {
    const body: Record<string, unknown> = {};
    if (note !== initialNote) body.context_note = note;
    if (pillar !== initialPillar) body.pillar = pillar;
    if (JSON.stringify(tags) !== JSON.stringify(initialTags || [])) body.content_tags = tags;
    if (JSON.stringify(brandIds.sort()) !== JSON.stringify(initialBrandIds.sort())) body.brand_ids = brandIds;
    if (JSON.stringify(projectIds.sort()) !== JSON.stringify(initialProjectIds.sort())) body.project_ids = projectIds;
    if (JSON.stringify(personaIds.sort()) !== JSON.stringify(initialPersonaIds.sort())) body.persona_ids = personaIds;

    if (Object.keys(body).length === 0) return true;

    const res = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) return false;

    onSaved(note, pillar, tags, brandIds, projectIds, personaIds);
    return true;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const ok = await doSave();
      if (ok) onClose();
      else alert("Failed to save changes");
    } catch {
      alert("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndNext() {
    if (!onNext) return;
    setSaving(true);
    try {
      await doSave();
      onNext();
    } catch {
      alert("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  const totalTagged = initialBrandIds.length + initialProjectIds.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-4xl max-h-[90vh] flex-col border border-border bg-surface overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image — full width */}
        <div className="relative flex items-center justify-center bg-background">
          {mediaType?.startsWith("video") || mediaType === "video" ? (
            <video
              src={imageUrl}
              controls
              className="w-full object-contain"
              style={{ maxHeight: "45vh" }}
            />
          ) : faceData && faceData.length > 0 ? (
            <FaceOverlay
              imageUrl={imageUrl}
              faces={faceData}
              detectionWidth={faceDetectionWidth}
              detectionHeight={faceDetectionHeight}
              personas={personaList}
              assetId={assetId}
              onFaceNamed={(faceIndex, personaId, personaName) => {
                setFaceData((prev) =>
                  prev ? prev.map((f, i) =>
                    i === faceIndex ? { ...f, personaId, personaName } : f
                  ) : prev
                );
              }}
            />
          ) : (
            <img
              src={imageUrl}
              alt=""
              className="w-full object-contain"
              style={{ maxHeight: "45vh" }}
            />
          )}
          <button onClick={onClose} className="absolute right-3 top-3 rounded bg-black/50 px-2 py-1 text-xs text-white hover:bg-black/70">✕</button>
        </div>

        {/* Content */}
        <div className="px-6 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Edit Asset</h3>
          </div>

            {/* Asset metadata */}
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                source === "ai_generated" ? "bg-accent/20 text-accent" : "bg-surface-hover text-muted"
              }`}>
                {source === "ai_generated" ? "AI" : mediaType}
              </span>
              {sceneType && (
                <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted">
                  {sceneType}
                </span>
              )}
              {qualityScore != null && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  qualityScore >= 0.8 ? "bg-success/20 text-success"
                    : qualityScore >= 0.5 ? "bg-warning/20 text-warning"
                    : "bg-danger/20 text-danger"
                }`}>
                  {(qualityScore * 100).toFixed(0)}%
                </span>
              )}
              {captionSource && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  captionSource === "ai" ? "bg-accent/20 text-accent"
                    : captionSource === "corrected" ? "bg-warning/20 text-warning"
                    : "bg-success/20 text-success"
                }`}>
                  {captionSource === "ai" ? "AI caption" : captionSource === "corrected" ? "corrected" : "manual"}
                </span>
              )}
              {totalTagged > 0 && (
                <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                  {totalTagged} tagged
                </span>
              )}
            </div>

            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-muted">
                Context Note
                {speech.listening && (
                  <span className="ml-2 text-[10px] text-danger animate-pulse">● listening</span>
                )}
              </label>
              <div className="flex items-center gap-3">
                {speech.supported && (
                  <button
                    onClick={speech.toggle}
                    type="button"
                    className={`text-[10px] ${speech.listening ? "text-danger" : "text-muted hover:text-foreground"}`}
                    title={speech.listening ? "Stop dictation" : "Start dictation"}
                  >
                    {speech.listening ? "■ Stop" : "🎤 Dictate"}
                  </button>
                )}
                <button
                  onClick={async () => {
                    setGenerating(true);
                    try {
                      const res = await fetch(`/api/assets/${assetId}/generate-caption`, { method: "POST" });
                      if (res.ok) {
                        const data = await res.json();
                        if (data.caption) setNote(data.caption);
                      } else {
                        const data = await res.json();
                        if (data.error) alert(data.error);
                      }
                    } catch { /* ignore */ }
                    setGenerating(false);
                  }}
                  disabled={generating}
                  className="text-[10px] text-accent hover:underline disabled:opacity-50"
                >
                  {generating ? "Generating..." : "Generate caption"}
                </button>
              </div>
            </div>
            {speech.interim && (
              <p className="mb-1 text-[10px] italic text-muted">{speech.interim}</p>
            )}
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={note}
                onChange={handleNoteChange}
                onKeyDown={handleNoteKeyDown}
                className="w-full h-full text-sm"
                style={{ minHeight: 120 }}
                placeholder="List details: brass bar sink, #BrandName, walnut countertop, https://vendor.com/product..."
              />
              {hashQuery !== null && hashMatches.length > 0 && (
                <div className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded border border-border bg-surface shadow-lg">
                  {hashMatches.map((v, i) => (
                    <button
                      key={v.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertBrandTag(v);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                        i === hashIndex ? "bg-accent/10 text-accent" : "text-foreground hover:bg-surface-hover"
                      }`}
                    >
                      <span>
                        <span className="text-muted">#</span>
                        {v.slug}
                        <span className="ml-2 text-xs text-muted">{v.name}</span>
                      </span>
                      {v.url && (
                        <span className="text-[10px] text-muted">↗</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
        </div>

        {/* Tags */}
        {pillarConfig.length > 0 && (
          <div className="border-t border-border px-6 py-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs text-muted">
                {suggesting ? "Suggesting tags..." : tags.length > 0 ? "Tags" : "Tags (write a note to get suggestions)"}
              </label>
              {!showFullPicker && (
                <button
                  onClick={() => setShowFullPicker(true)}
                  className="text-[10px] text-accent hover:underline"
                >
                  Browse all tags
                </button>
              )}
            </div>

            {/* Selected tags as chips */}
            {tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {tags.map((tagId) => {
                  const tagLabel = pillarConfig
                    .flatMap((p) => p.tags)
                    .find((t) => t.id === tagId)?.label || tagId;
                  return (
                    <button
                      key={tagId}
                      onClick={() => setTags(tags.filter((t) => t !== tagId))}
                      className="flex items-center gap-1 rounded bg-accent/20 px-2 py-0.5 text-xs text-accent"
                    >
                      {tagLabel}
                      <span className="text-accent/60">✕</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Full tag picker — always visible at full width */}
            <TagPicker
              pillarConfig={pillarConfig}
              selectedPillar={pillar}
              selectedTags={tags}
              onPillarChange={setPillar}
              onTagsChange={setTags}
            />
          </div>
        )}

        {/* Row 3: Brands */}
        {brandLabel && (
          <div className="border-t border-border px-6 py-4">
            <label className="mb-1.5 block text-xs text-muted">{brandLabel}</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {localBrands.map((b) => {
                const selected = brandIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    onClick={() =>
                      setBrandIds((prev) =>
                        selected ? prev.filter((id) => id !== b.id) : [...prev, b.id]
                      )
                    }
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      selected
                        ? "bg-accent/20 text-accent"
                        : "bg-surface-hover text-muted hover:text-foreground"
                    }`}
                  >
                    {b.name}
                    {b.url && selected && (
                      <span className="ml-1 text-accent/50">↗</span>
                    )}
                  </button>
                );
              })}
              <span className="flex items-center gap-1">
                <input
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && quickCreateBrand()}
                  placeholder={`+ ${brandLabel}`}
                  className="w-28 rounded bg-transparent px-2 py-0.5 text-xs text-muted outline-none placeholder:text-muted/50 focus:bg-surface-hover"
                />
                {newBrandName.trim() && (
                  <button
                    onClick={quickCreateBrand}
                    disabled={creatingBrand}
                    className="text-[10px] text-accent hover:underline"
                  >
                    {creatingBrand ? "..." : "Add"}
                  </button>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Row 4: Projects */}
        {projectLabel && (
          <div className="border-t border-border px-6 py-4">
            <label className="mb-1.5 block text-xs text-muted">{projectLabel}</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {localProjects.map((p) => {
                const selected = projectIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      setProjectIds((prev) =>
                        selected ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                      )
                    }
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      selected
                        ? "bg-accent/20 text-accent"
                        : "bg-surface-hover text-muted hover:text-foreground"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
              <span className="flex items-center gap-1">
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && quickCreateProject()}
                  placeholder={`+ ${projectLabel}`}
                  className="w-28 rounded bg-transparent px-2 py-0.5 text-xs text-muted outline-none placeholder:text-muted/50 focus:bg-surface-hover"
                />
                {newProjectName.trim() && (
                  <button
                    onClick={quickCreateProject}
                    disabled={creatingProject}
                    className="text-[10px] text-accent hover:underline"
                  >
                    {creatingProject ? "..." : "Add"}
                  </button>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Row 5: Personas */}
        {personaLabel && personaList.length > 0 && (
          <div className="border-t border-border px-6 py-4">
            <label className="mb-1.5 block text-xs text-muted">{personaLabel}</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {personaList.map((p) => {
                const selected = personaIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      setPersonaIds((prev) =>
                        selected ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                      )
                    }
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      selected
                        ? "bg-purple-500/20 text-purple-400"
                        : "bg-surface-hover text-muted hover:text-foreground"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer: actions */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          {confirmDelete === "replace" ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-warning">Used in a blog post. Upload a replacement image/video (same type).</span>
              <input
                ref={replaceFileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setReplacing(true);
                  setReplaceError(null);
                  try {
                    if (file.type.startsWith("video/")) {
                      // Presigned direct-upload path for large files
                      const presignRes = await fetch(`/api/assets/${assetId}/replace`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
                      });
                      const presign = await presignRes.json();
                      if (!presignRes.ok || !presign.uploadUrl) {
                        setReplaceError(presign.error || "Could not prepare upload");
                        setReplacing(false);
                        return;
                      }
                      const put = await fetch(presign.uploadUrl, {
                        method: "PUT",
                        headers: { "Content-Type": file.type },
                        body: file,
                      });
                      if (!put.ok) {
                        setReplaceError("Upload to storage failed");
                        setReplacing(false);
                        return;
                      }
                    } else {
                      const fd = new FormData();
                      fd.append("file", file);
                      const res = await fetch(`/api/assets/${assetId}/replace`, {
                        method: "POST",
                        body: fd,
                      });
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        setReplaceError(data.error || "Replacement failed");
                        setReplacing(false);
                        return;
                      }
                    }
                    // Same URL, new bytes. Close the modal; library re-fetches
                    // via its parent; CDN will catch up within 24h.
                    onDeleted?.();
                    onClose();
                  } catch {
                    setReplaceError("Replacement failed");
                  } finally {
                    setReplacing(false);
                  }
                }}
              />
              <button
                onClick={() => replaceFileRef.current?.click()}
                disabled={replacing}
                className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {replacing ? "Uploading..." : "Choose replacement"}
              </button>
              <button
                onClick={() => { setConfirmDelete(false); setReplaceError(null); }}
                className="text-xs text-muted hover:text-foreground"
              >
                Cancel
              </button>
              {replaceError && <span className="text-[10px] text-danger">{replaceError}</span>}
            </div>
          ) : confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-danger">Delete this asset?</span>
              <button
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const res = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
                    if (res.ok) {
                      onDeleted?.();
                      onClose();
                    } else {
                      const data = await res.json();
                      if (data.requiresReplace) {
                        setConfirmDelete("replace");
                        setDeleting(false);
                        return;
                      }
                    }
                  } catch { /* ignore */ }
                  setDeleting(false);
                }}
                disabled={deleting}
                className="rounded bg-danger px-3 py-1 text-xs font-medium text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Yes, delete"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 text-xs text-danger hover:underline"
            >
              Delete
            </button>
          )}
          <div className="flex items-center gap-2">
            {hasPrev && (
              <button
                onClick={onPrev}
                className="px-3 py-2 text-xs text-muted hover:text-foreground"
              >
                Prev
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="border border-border px-4 py-2 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {hasNext && (
              <button
                onClick={handleSaveAndNext}
                disabled={saving}
                className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {saving ? "..." : "Save & Next >>"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
