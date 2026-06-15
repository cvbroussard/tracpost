"use client";

import { useState, useEffect, useCallback } from "react";
import { ManagePage } from "@/components/manage/manage-page";

interface GbpData {
  profile: {
    title: string | null;
    phone: string | null;
    website: string | null;
    address: Record<string, unknown> | null;
    categories: unknown;
    hours: unknown;
    description: string | null;
  };
  sync: { dirty: boolean; dirtyFields: string[] };
  photos: { synced: number };
  reviews: { total: number; pendingReplies: number };
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${ok ? "bg-success" : "bg-danger"}`} />;
}

function Row({ label, value, ok }: { label: string; value: string | number; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
      <div className="flex items-center gap-2">
        {ok !== undefined && <StatusDot ok={ok} />}
        <span className="text-[10px] text-muted">{label}</span>
      </div>
      <span className="text-xs font-medium">{String(value)}</span>
    </div>
  );
}

function GbpContent({ siteId }: { siteId: string }) {
  const [data, setData] = useState<GbpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [pullFeedback, setPullFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/ops/gbp?site_id=${siteId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, [siteId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function pullProfile() {
    setPulling(true);
    setPullFeedback(null);
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/gbp-profile-pull`, { method: "POST" });
      const d = await res.json();
      if (res.ok && d.ok) {
        if (d.description_changed) {
          setPullFeedback({ ok: true, message: "Description updated from Google." });
        } else {
          setPullFeedback({ ok: true, message: "Re-synced. No description change detected." });
        }
        load();
      } else {
        setPullFeedback({ ok: false, message: `${d.error ?? "error"}: ${d.message ?? "pull failed"}` });
      }
    } catch (e) {
      setPullFeedback({ ok: false, message: e instanceof Error ? e.message : "request failed" });
    } finally {
      setPulling(false);
    }
  }

  // Operator surface trimmed 2026-06-13: Connection Health card + all action
  // buttons (Push to Google, Sync Photos, Sync Reviews, Regenerate Categories,
  // OAuth init, Refresh Token, Verify GSC, Assign Location) retired. Page is
  // pure observation; mutations belong to tenant studio or platform-internal
  // pipelines, not the operator.

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!data) return <p className="p-6 text-xs text-muted">Failed to load GBP data.</p>;

  const addr = data.profile.address as Record<string, unknown> | null;
  const addressStr = addr
    ? [addr.addressLines, addr.locality, addr.administrativeArea].filter(Boolean).join(", ")
    : "Not set";

  const categories = data.profile.categories as Array<{ displayName?: string; name?: string }> | null;
  const primaryCategory = categories?.[0]?.displayName || categories?.[0]?.name || "Not set";
  const additionalCount = categories ? Math.max(0, categories.length - 1) : 0;

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Left — observed sync state */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Sync Status</h3>
            <Row label="Dirty Fields" value={data.sync.dirty ? data.sync.dirtyFields.join(", ") : "In sync"} ok={!data.sync.dirty} />
            <Row label="Photos Synced" value={data.photos.synced} />
            <Row label="Reviews" value={`${data.reviews.total} total`} />
            {data.reviews.pendingReplies > 0 && (
              <Row label="Pending Replies" value={data.reviews.pendingReplies} ok={false} />
            )}
          </div>

          {/* Manual GBP profile re-sync (beta tooling).
              Owner edits on Google → click here → local cache refreshes →
              PPA observes the live state on next run. Photos are a separate
              flow. Categories stay TracPost-canonical (per locked doctrine);
              they are not refreshed by this action. */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card space-y-2">
            <h3 className="text-sm font-medium">Re-sync from Google</h3>
            <p className="text-[10px] text-muted leading-relaxed">
              Refreshes the local cache for description, hours, phone, address, website,
              service areas, and review stats. Use when the owner has edited the GBP
              listing directly on Google&apos;s side. Photos and categories are not
              touched by this action.
            </p>
            <button
              type="button"
              onClick={pullProfile}
              disabled={pulling}
              className="w-full rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-wait transition-colors"
            >
              {pulling ? "Pulling…" : "⚙ Pull profile from Google"}
            </button>
            {pullFeedback && (
              <p
                className={`text-[10px] ${
                  pullFeedback.ok
                    ? "text-green-700 dark:text-green-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {pullFeedback.message}
              </p>
            )}
          </div>
        </div>

        {/* Right — Profile (read-only) */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">GBP Profile</h3>
            <Row label="Business Name" value={data.profile.title || "Not set"} />
            <Row label="Phone" value={data.profile.phone || "Not set"} />
            <Row label="Website" value={data.profile.website || "Not set"} />
            <Row label="Address" value={addressStr} />
            <Row label="Primary Category" value={primaryCategory} />
            {additionalCount > 0 && (
              <Row label="Additional Categories" value={`+${additionalCount}`} />
            )}
          </div>

          {data.profile.description && (
            <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
              <h3 className="text-sm font-medium mb-2">Description</h3>
              <p className="text-xs text-muted leading-relaxed">{data.profile.description}</p>
            </div>
          )}

          {(() => {
            const hours = data.profile.hours as Array<{ day: string; openTime: string; closeTime: string }> | null;
            if (!hours || !Array.isArray(hours) || hours.length === 0) return null;
            return (
              <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
                <h3 className="text-sm font-medium mb-2">Business Hours</h3>
                <div className="space-y-0.5">
                  {hours.map((h, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted capitalize">{h.day}</span>
                      <span>{h.openTime} — {h.closeTime}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="Google Business Profile" requireSite>
      {({ siteId }) => <GbpContent siteId={siteId} />}
    </ManagePage>
  );
}
