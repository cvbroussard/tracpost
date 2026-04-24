"use client";

import { useState, useEffect } from "react";
import { ManagePage } from "@/components/manage/manage-page";

interface GbpData {
  connected: boolean;
  account: { name: string; status: string; tokenExpires: string | null } | null;
  location: { locationId: string; syncStatus: string } | null;
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
  searchConsole: { property: string | null; verified: boolean; tokenSet: boolean };
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

  useEffect(() => {
    setLoading(true);
    fetch(`/api/manage/gbp?site_id=${siteId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, [siteId]);

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

  const tokenExpires = data.account?.tokenExpires
    ? new Date(data.account.tokenExpires)
    : null;
  const tokenOk = tokenExpires ? tokenExpires > new Date() : false;

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Left — Connection & Status */}
        <div className="space-y-4">
          {/* Connection health */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Connection Health</h3>
            <Row label="GBP Connected" value={data.connected ? "Yes" : "No"} ok={data.connected} />
            {data.account && (
              <>
                <Row label="Account" value={data.account.name} ok={data.account.status === "active"} />
                <Row label="Token Status" value={tokenOk ? "Active" : "Expired"} ok={tokenOk} />
                {tokenExpires && (
                  <Row label="Token Expires" value={tokenExpires.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric" })} />
                )}
              </>
            )}
            <Row label="Location Linked" value={data.location ? "Yes" : "No"} ok={!!data.location} />
            <Row label="Search Console" value={data.searchConsole.verified ? "Verified" : "Not verified"} ok={data.searchConsole.verified} />
          </div>

          {/* Sync status */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Sync Status</h3>
            <Row label="Dirty Fields" value={data.sync.dirty ? data.sync.dirtyFields.join(", ") : "None — in sync"} ok={!data.sync.dirty} />
            <Row label="Photos Synced" value={data.photos.synced} />
            <Row label="Reviews" value={`${data.reviews.total} total`} />
            {data.reviews.pendingReplies > 0 && (
              <Row label="Pending Replies" value={data.reviews.pendingReplies} ok={false} />
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

          {/* Hours preview */}
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
