"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { TagPicker, type PillarGroup } from "./tag-picker";

interface Vendor {
  id: string;
  name: string;
  slug: string;
  url: string | null;
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
  vendors?: Vendor[];
  initialVendorIds?: string[];
  source?: string | null;
  qualityScore?: number | null;
  sceneType?: string | null;
  onClose: () => void;
  onSaved: (note: string, pillar: string, tags: string[]) => void;
  onDeleted?: () => void;
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
  vendors = [],
  initialVendorIds = [],
  source,
  qualityScore,
  sceneType,
  onClose,
  onSaved,
  onDeleted,
}: AssetEditModalProps) {
  const [note, setNote] = useState(initialNote);
  const [pillar, setPillar] = useState(initialPillar);
  const [tags, setTags] = useState<string[]>(initialTags || []);
  const [vendorIds, setVendorIds] = useState<string[]>(initialVendorIds);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<boolean | "force">(false);
  const [deleting, setDeleting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Vendor hashtag autocomplete state
  const [hashQuery, setHashQuery] = useState<string | null>(null);
  const [hashIndex, setHashIndex] = useState(0);
  const [hashStart, setHashStart] = useState(0);

  const hashMatches = hashQuery !== null
    ? vendors.filter((v) =>
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
      insertVendorTag(hashMatches[hashIndex]);
    } else if (e.key === "Escape") {
      setHashQuery(null);
    }
  }

  function insertVendorTag(vendor: Vendor) {
    const before = note.slice(0, hashStart);
    const after = note.slice(textareaRef.current?.selectionStart || hashStart + (hashQuery?.length || 0) + 1);
    const inserted = `#${vendor.slug} `;
    const newNote = before + inserted + after;
    setNote(newNote);
    setHashQuery(null);

    // Auto-add vendor to selection
    setVendorIds((prev) =>
      prev.includes(vendor.id) ? prev : [...prev, vendor.id]
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

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (note !== initialNote) body.context_note = note;
      if (pillar !== initialPillar) body.pillar = pillar;
      if (JSON.stringify(tags) !== JSON.stringify(initialTags || [])) body.content_tags = tags;
      if (JSON.stringify(vendorIds.sort()) !== JSON.stringify(initialVendorIds.sort())) body.vendor_ids = vendorIds;

      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }

      const res = await fetch(`/api/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Save failed");

      onSaved(note, pillar, tags);
      onClose();
    } catch {
      alert("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-4xl max-h-[90vh] flex-col border border-border bg-surface overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Row 1: Image + Context Note side by side */}
        <div className="flex">
          {/* Left: Image */}
          <div className="hidden sm:flex w-2/5 shrink-0 items-center justify-center bg-background">
            {mediaType?.startsWith("video") || mediaType === "video" ? (
              <video
                src={imageUrl}
                controls
                className="h-full w-full object-contain"
                style={{ maxHeight: "50vh" }}
              />
            ) : (
              <img
                src={imageUrl}
                alt=""
                className="h-full w-full object-contain"
                style={{ maxHeight: "50vh" }}
              />
            )}
          </div>

          {/* Right: Context Note */}
          <div className="flex flex-1 flex-col p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Edit Asset</h3>
              <button onClick={onClose} className="text-muted hover:text-foreground">✕</button>
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
              {initialVendorIds.length > 0 && (
                <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                  {initialVendorIds.length} vendor{initialVendorIds.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            <label className="mb-1 block text-xs text-muted">Context Note</label>
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={note}
                onChange={handleNoteChange}
                onKeyDown={handleNoteKeyDown}
                className="w-full h-full text-sm"
                style={{ minHeight: 120 }}
                placeholder="List details: brass bar sink, #VendorName, walnut countertop, https://vendor.com/product..."
              />
              {hashQuery !== null && hashMatches.length > 0 && (
                <div className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded border border-border bg-surface shadow-lg">
                  {hashMatches.map((v, i) => (
                    <button
                      key={v.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertVendorTag(v);
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
        </div>

        {/* Row 2: Tags full width */}
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

        {/* Row 3: Vendors */}
        {vendors.length > 0 && (
          <div className="border-t border-border px-6 py-4">
            <label className="mb-2 block text-xs text-muted">Vendors</label>
            <div className="flex flex-wrap gap-1.5">
              {vendors.map((v) => {
                const selected = vendorIds.includes(v.id);
                return (
                  <button
                    key={v.id}
                    onClick={() =>
                      setVendorIds((prev) =>
                        selected ? prev.filter((id) => id !== v.id) : [...prev, v.id]
                      )
                    }
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      selected
                        ? "bg-accent/20 text-accent"
                        : "bg-surface-hover text-muted hover:text-foreground"
                    }`}
                  >
                    {v.name}
                    {v.url && selected && (
                      <span className="ml-1 text-accent/50">↗</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer: actions */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-danger">{confirmDelete === "force" ? "Used in a blog post. Delete anyway?" : "Delete this asset?"}</span>
              <button
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const force = confirmDelete === "force" ? "?force=true" : "";
                    const res = await fetch(`/api/assets/${assetId}${force}`, { method: "DELETE" });
                    if (res.ok) {
                      onDeleted?.();
                      onClose();
                    } else {
                      const data = await res.json();
                      if (data.requiresForce) {
                        setConfirmDelete("force");
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
                {deleting ? "Deleting..." : confirmDelete === "force" ? "Yes, delete anyway" : "Yes, delete"}
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
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
