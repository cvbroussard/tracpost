"use client";

import { useState } from "react";
import { toast } from "@/components/feedback";

const PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "gbp", label: "Google Business" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "pinterest", label: "Pinterest" },
];

export function EditExistingAccounts({
  siteId,
  initialExisting,
}: {
  siteId: string;
  initialExisting: string[];
}) {
  const [existing, setExisting] = useState<Set<string>>(new Set(initialExisting));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasChanges = (() => {
    const initial = new Set(initialExisting);
    if (existing.size !== initial.size) return true;
    for (const id of existing) if (!initial.has(id)) return true;
    return false;
  })();

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/dashboard/sites/update-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, existingAccounts: Array.from(existing) }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const toCreate = PLATFORMS.filter((p) => !existing.has(p.id));

  return (
    <section className="mb-8">
      <h2 className="mb-1">Connections</h2>
      <p className="mb-4 text-sm text-muted">
        Update which platforms you already have accounts on. You can change this until provisioning begins.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PLATFORMS.map((p) => (
          <label key={p.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={existing.has(p.id)}
              onChange={(e) => {
                setExisting((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(p.id);
                  else next.delete(p.id);
                  return next;
                });
              }}
              className="accent-accent"
            />
            <span className={existing.has(p.id) ? "text-foreground" : "text-muted"}>
              {p.label}
            </span>
          </label>
        ))}
      </div>

      {toCreate.length > 0 && (
        <p className="mt-2 text-[11px] text-dim">
          Will be created for you: {toCreate.map((p) => p.label).join(", ")}
        </p>
      )}

      {hasChanges && (
        <button
          onClick={save}
          disabled={saving}
          className="mt-3 bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving..." : saved ? "Saved" : "Save Changes"}
        </button>
      )}
    </section>
  );
}
