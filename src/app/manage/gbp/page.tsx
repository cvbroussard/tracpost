"use client";

import { useState, useEffect, useCallback } from "react";
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

function ActionBtn({ label, onClick, loading, variant }: { label: string; onClick: () => void; loading?: boolean; variant?: "primary" | "outline" }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`rounded px-3 py-1 text-[10px] font-medium disabled:opacity-50 ${
        variant === "primary"
          ? "bg-accent text-white hover:bg-accent-hover"
          : "border border-border text-muted hover:text-foreground hover:bg-surface-hover"
      }`}
    >
      {loading ? "..." : label}
    </button>
  );
}

function GbpContent({ siteId }: { siteId: string }) {
  const [data, setData] = useState<GbpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/manage/gbp?site_id=${siteId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, [siteId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function act(action: string, endpoint: string, body: Record<string, unknown>) {
    setActing(action);
    setResult(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      setResult(d.success ? `${action}: done` : (d.error || "Failed"));
      load();
    } catch { setResult("Request failed"); }
    setActing(null);
  }

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

  const tokenExpires = data.account?.tokenExpires ? new Date(data.account.tokenExpires) : null;
  const tokenOk = tokenExpires ? tokenExpires > new Date() : false;

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Left — Connection, Status, Actions */}
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

            {/* Contextual actions */}
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border">
              {!data.connected && (
                <ActionBtn label="Initiate Google OAuth" variant="primary"
                  loading={acting === "oauth"}
                  onClick={() => { window.open(`/api/auth/google?site_id=${siteId}&source=admin`, "_blank"); }}
                />
              )}
              {data.connected && !data.location && (
                <ActionBtn label="Assign Location" variant="primary"
                  loading={acting === "assign"}
                  onClick={() => { window.location.href = "/manage/provisioning"; }}
                />
              )}
              {data.connected && !tokenOk && (
                <ActionBtn label="Refresh Token" variant="outline"
                  loading={acting === "refresh"}
                  onClick={() => act("refresh", `/api/admin/sites/${siteId}/autopilot`, { action: "refresh_tokens" })}
                />
              )}
              {!data.searchConsole.verified && data.connected && (
                <ActionBtn label="Verify Search Console" variant="outline"
                  loading={acting === "gsc"}
                  onClick={() => act("gsc", `/api/admin/sites/${siteId}/search-console`, { action: "verify" })}
                />
              )}
            </div>
          </div>

          {/* Sync status + actions */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Sync Status</h3>
            <Row label="Dirty Fields" value={data.sync.dirty ? data.sync.dirtyFields.join(", ") : "In sync"} ok={!data.sync.dirty} />
            <Row label="Photos Synced" value={data.photos.synced} />
            <Row label="Reviews" value={`${data.reviews.total} total`} />
            {data.reviews.pendingReplies > 0 && (
              <Row label="Pending Replies" value={data.reviews.pendingReplies} ok={false} />
            )}

            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border">
              {data.sync.dirty && (
                <ActionBtn label="Push to Google" variant="primary"
                  loading={acting === "push"}
                  onClick={() => act("push", `/api/admin/sites/${siteId}/autopilot`, { action: "publish", platform: "gbp" })}
                />
              )}
              <ActionBtn label="Sync Photos" variant="outline"
                loading={acting === "photos"}
                onClick={() => act("photos", `/api/admin/sites/${siteId}/photos`, { action: "sync_blue_ribbon" })}
              />
              <ActionBtn label="Sync Reviews" variant="outline"
                loading={acting === "reviews"}
                onClick={() => act("reviews", `/api/admin/sites/${siteId}/reviews`, {})}
              />
              <ActionBtn label="Regenerate Categories" variant="outline"
                loading={acting === "categories"}
                onClick={() => act("categories", `/api/admin/sites/${siteId}/services/regenerate`, { step: "categorize" })}
              />
            </div>

            {result && <p className="text-[10px] text-muted mt-2">{result}</p>}
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
