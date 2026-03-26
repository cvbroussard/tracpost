"use client";

import { useState } from "react";

interface AssetEditModalProps {
  assetId: string;
  initialNote: string;
  initialPillar: string;
  availablePillars: string[];
  onClose: () => void;
  onSaved: (note: string, pillar: string) => void;
}

export function AssetEditModal({
  assetId,
  initialNote,
  initialPillar,
  availablePillars,
  onClose,
  onSaved,
}: AssetEditModalProps) {
  const [note, setNote] = useState(initialNote);
  const [pillar, setPillar] = useState(initialPillar);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (note !== initialNote) body.context_note = note;
      if (pillar !== initialPillar) body.pillar = pillar;

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

      onSaved(note, pillar);
      onClose();
    } catch {
      alert("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-sm font-semibold">Edit Asset</h3>

        <label className="mb-1 block text-xs text-muted">Context Note</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-accent"
          rows={6}
          placeholder="Describe this content..."
        />

        {availablePillars.length > 0 && (
          <>
            <label className="mb-2 block text-xs text-muted">Content Pillar</label>
            <div className="mb-4 flex flex-wrap gap-2">
              {availablePillars.map((p) => (
                <button
                  key={p}
                  onClick={() => setPillar(p === pillar ? "" : p)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    p === pillar
                      ? "bg-accent text-white"
                      : "bg-surface-hover text-muted hover:text-foreground"
                  }`}
                >
                  {p.replace("_", " ")}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
