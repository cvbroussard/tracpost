"use client";

import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import Link from "next/link";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SyncedPhoto = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EligibleAsset = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ImageAsset = any;

interface Props {
  siteId: string;
  connected: boolean;
  initialSynced: SyncedPhoto[];
  initialEligible: EligibleAsset[];
  allImages: ImageAsset[];
  coverUrl: string | null;
  logoUrl: string | null;
  coverAssetId: string | null;
  logoAssetId: string | null;
  stats: {
    total: number;
    product: number;
    at_work: number;
    exterior: number;
    interior: number;
    additional: number;
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  PRODUCT: "Product / Results",
  AT_WORK: "At Work",
  EXTERIOR: "Exterior",
  INTERIOR: "Interior",
  TEAMS: "Team",
  ADDITIONAL: "Additional",
  COVER: "Cover Photo",
  LOGO: "Logo",
};

const CATEGORY_COLORS: Record<string, string> = {
  PRODUCT: "bg-blue-100 text-blue-800",
  AT_WORK: "bg-amber-100 text-amber-800",
  EXTERIOR: "bg-emerald-100 text-emerald-800",
  INTERIOR: "bg-purple-100 text-purple-800",
  ADDITIONAL: "bg-gray-100 text-gray-500",
};

function StatCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-center">
      <p className="text-xl font-semibold">{count}</p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  );
}

function ImagePicker({ images, currentId, onSelect, onClose, title }: {
  images: ImageAsset[];
  currentId: string | null;
  onSelect: (id: string, url: string) => void;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-xl border border-border bg-surface p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground">✕</button>
        </div>
        <div className="grid grid-cols-5 gap-2 max-h-[60vh] overflow-y-auto">
          {images.map((img: ImageAsset) => (
            <button
              key={img.id}
              onClick={() => onSelect(img.id, img.storage_url)}
              className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                img.id === currentId ? "border-accent" : "border-transparent hover:border-accent/50"
              }`}
            >
              <img src={img.storage_url} alt="" className="h-full w-full object-cover" />
              {img.id === currentId && (
                <div className="absolute inset-0 bg-accent/20 flex items-center justify-center">
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] text-white">Current</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PhotosClient({ siteId, connected, initialSynced, initialEligible, allImages, coverUrl, logoUrl, coverAssetId, logoAssetId, stats }: Props) {
  const [synced, setSynced] = useState<SyncedPhoto[]>(initialSynced);
  const [eligible] = useState<EligibleAsset[]>(initialEligible);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"gallery" | "eligible">("gallery");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [currentCover, setCurrentCover] = useState<{ id: string | null; url: string | null }>({ id: coverAssetId, url: coverUrl });
  const [currentLogo, setCurrentLogo] = useState<{ id: string | null; url: string | null }>({ id: logoAssetId, url: logoUrl });
  const [pickerOpen, setPickerOpen] = useState<"cover" | "logo" | null>(null);

  if (!connected) {
    return (
      <div className="p-6">
        <EmptyState
          icon="▣"
          title="Connect Google Business Profile"
          description="Link your GBP account to sync your best photos to your Google listing automatically."
        />
      </div>
    );
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncResult(`${data.synced} photos synced, ${data.skipped} skipped`);
        window.location.reload();
      } else {
        setSyncResult("Sync failed");
      }
    } catch {
      setSyncResult("Sync failed");
    }
    setSyncing(false);
  }

  async function handleDelete(gbpMediaName: string) {
    setDeleting(gbpMediaName);
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", gbpMediaName }),
      });
      const data = await res.json();
      if (data.success) {
        setSynced((prev) => prev.filter((p: SyncedPhoto) => p.gbp_media_name !== gbpMediaName));
      }
    } catch { /* ignore */ }
    setDeleting(null);
  }

  async function setAsset(type: "cover" | "logo", assetId: string, url: string) {
    const res = await fetch(`/api/admin/sites/${siteId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: type === "cover" ? "set_cover" : "set_logo", sourceUrl: url }),
    });

    // Save reference locally
    await fetch(`/api/google/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_id: siteId,
        [`gbp_${type}_asset_id`]: assetId,
      }),
    });

    if (type === "cover") {
      setCurrentCover({ id: assetId, url });
    } else {
      setCurrentLogo({ id: assetId, url });
    }
    setPickerOpen(null);
    setSyncResult(`${type === "cover" ? "Cover" : "Logo"} updated`);
    setTimeout(() => setSyncResult(null), 3000);
  }

  return (
    <div className="p-4">
      {/* Cover + Logo */}
      <div className="mb-4 grid grid-cols-[1fr_auto] gap-4">
        {/* Cover photo */}
        <div
          className="relative h-36 overflow-hidden rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 cursor-pointer group"
          onClick={() => setPickerOpen("cover")}
        >
          {currentCover.url ? (
            <img src={currentCover.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-xs text-white/40">Click to set cover photo</p>
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <span className="text-xs text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              {currentCover.url ? "Change Cover" : "Set Cover"}
            </span>
          </div>
          <span className="absolute top-2 left-2 rounded bg-black/50 px-2 py-0.5 text-[9px] text-white">
            Cover Photo · 1080×608
          </span>
        </div>

        {/* Logo */}
        <div
          className="relative h-36 w-36 overflow-hidden rounded-xl bg-surface-hover cursor-pointer group border border-border"
          onClick={() => setPickerOpen("logo")}
        >
          {currentLogo.url ? (
            <img src={currentLogo.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-[10px] text-muted text-center px-2">Click to set logo</p>
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <span className="text-xs text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              {currentLogo.url ? "Change" : "Set Logo"}
            </span>
          </div>
          <span className="absolute top-2 left-2 rounded bg-black/50 px-2 py-0.5 text-[9px] text-white">
            Logo · 250×250
          </span>
        </div>
      </div>

      {/* Image picker modal */}
      {pickerOpen && (
        <ImagePicker
          images={allImages}
          currentId={pickerOpen === "cover" ? currentCover.id : currentLogo.id}
          title={pickerOpen === "cover" ? "Select Cover Photo" : "Select Logo"}
          onSelect={(id, url) => setAsset(pickerOpen, id, url)}
          onClose={() => setPickerOpen(null)}
        />
      )}

      {/* Stats bar */}
      <div className="mb-4 grid grid-cols-6 gap-2">
        <StatCard label="On Google" count={stats.total} />
        <StatCard label="Product" count={stats.product} />
        <StatCard label="At Work" count={stats.at_work} />
        <StatCard label="Exterior" count={stats.exterior} />
        <StatCard label="Interior" count={stats.interior} />
        <StatCard label="Eligible" count={eligible.length} />
      </div>

      {/* Actions */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync to Google"}
        </button>
        {syncResult && <span className="text-xs text-muted">{syncResult}</span>}

        <div className="ml-auto flex gap-1">
          <button
            onClick={() => setActiveTab("gallery")}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              activeTab === "gallery" ? "bg-accent text-white" : "bg-surface-hover text-muted"
            }`}
          >
            On Google ({synced.length})
          </button>
          <button
            onClick={() => setActiveTab("eligible")}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              activeTab === "eligible" ? "bg-accent text-white" : "bg-surface-hover text-muted"
            }`}
          >
            Eligible ({eligible.length})
          </button>
        </div>
      </div>

      {/* Gallery: synced photos */}
      {activeTab === "gallery" && (
        <>
          {synced.length === 0 ? (
            <EmptyState
              icon="▣"
              title="No photos on Google yet"
              description="Click 'Sync to Google' to push your best media assets to your GBP listing."
            />
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {synced.map((photo: SyncedPhoto) => (
                <div key={photo.id} className="group relative overflow-hidden rounded-lg border border-border bg-surface">
                  <div className="aspect-[4/3] bg-surface-hover">
                    <img
                      src={photo.gbp_media_url || photo.source_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="p-2">
                    <div className="flex items-center justify-between">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
                        CATEGORY_COLORS[photo.category] || CATEGORY_COLORS.ADDITIONAL
                      }`}>
                        {CATEGORY_LABELS[photo.category] || photo.category}
                      </span>
                      {photo.quality_score && (
                        <span className="text-[9px] text-muted">{Math.round(photo.quality_score * 100)}%</span>
                      )}
                    </div>
                    <p className="mt-1 text-[9px] text-muted">
                      {new Date(photo.synced_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(photo.gbp_media_name)}
                    disabled={deleting === photo.gbp_media_name}
                    className="absolute right-1.5 top-1.5 rounded bg-black/60 px-2 py-0.5 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    {deleting === photo.gbp_media_name ? "..." : "Remove"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Eligible: assets ready to sync */}
      {activeTab === "eligible" && (
        <>
          {eligible.length === 0 ? (
            <EmptyState
              icon="▣"
              title="All eligible photos synced"
              description="New high-quality assets will appear here as they're uploaded and triaged."
            />
          ) : (
            <>
              <p className="mb-3 text-xs text-muted">
                These assets scored above threshold and are GBP-eligible. Click &quot;Sync to Google&quot; to push them.
              </p>
              <div className="grid grid-cols-4 gap-3">
                {eligible.map((asset: EligibleAsset) => (
                  <div key={asset.id} className="overflow-hidden rounded-lg border border-border bg-surface">
                    <div className="aspect-[4/3] bg-surface-hover">
                      <img
                        src={asset.storage_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-muted">{asset.content_pillar || "—"}</span>
                        <span className="text-[9px] font-medium">
                          {Math.round((asset.quality_score || 0) * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
