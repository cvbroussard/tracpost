"use client";

import { useState, useRef, useCallback } from "react";
import { TagPicker, type PillarGroup } from "./tag-picker";

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
  onClose: () => void;
  onSaved: (note: string, pillar: string, tags: string[]) => void;
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
  onClose,
  onSaved,
}: AssetEditModalProps) {
  const [note, setNote] = useState(initialNote);
  const [pillar, setPillar] = useState(initialPillar);
  const [tags, setTags] = useState<string[]>(initialTags || []);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            {mediaType?.startsWith("video") ? (
              <div className="flex h-full w-full items-center justify-center text-4xl text-muted">▶</div>
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
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Edit Asset</h3>
              <button onClick={onClose} className="text-muted hover:text-foreground">✕</button>
            </div>

            <label className="mb-1 block text-xs text-muted">Context Note</label>
            <textarea
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                suggestFromNote(e.target.value);
              }}
              className="w-full flex-1 text-sm"
              style={{ minHeight: 120 }}
              placeholder="Describe this content — AI will suggest tags as you type..."
            />
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

        {/* Footer: actions */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-3">
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
  );
}
