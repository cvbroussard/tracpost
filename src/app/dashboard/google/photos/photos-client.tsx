"use client";

import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { confirm } from "@/components/feedback";

interface Photo {
  id: string;
  storageUrl: string;
  qualityScore: number;
  contentPillar: string | null;
  sceneType: string | null;
  isSynced: boolean;
  syncedAt: string | null;
  isBlueRibbon: boolean;
}

interface Props {
  siteId: string;
  connected: boolean;
  photos: Photo[];
  coverUrl: string | null;
  logoUrl: string | null;
  coverAssetId: string | null;
  syncedCount: number;
  blueRibbonCount: number;
  totalCount: number;
}

function ImagePicker({ images, currentId, onSelect, onClose, title }: {
  images: Photo[];
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
          {images.map((img) => (
            <button
              key={img.id}
              onClick={() => onSelect(img.id, img.storageUrl)}
              className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                img.id === currentId ? "border-accent" : "border-transparent hover:border-accent/50"
              }`}
            >
              <img src={img.storageUrl} alt="" className="h-full w-full object-cover" />
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

export function PhotosClient({ siteId, connected, photos, coverUrl, logoUrl, coverAssetId, syncedCount, blueRibbonCount, totalCount }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "ribbon" | "synced">("all");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [currentCover, setCurrentCover] = useState<{ id: string | null; url: string | null }>({ id: coverAssetId, url: coverUrl });
  const [pickerOpen, setPickerOpen] = useState<"cover" | null>(null);
  const [photoList, setPhotoList] = useState(photos);

  if (!connected) {
    return (
      <div className="p-6">
        <EmptyState
          icon="▣"
          title="Connect Google Business Profile"
          description="Link your GBP account to manage your Google listing photos."
        />
      </div>
    );
  }

  const filtered = photoList.filter((p) => {
    if (filter === "ribbon") return p.isBlueRibbon;
    if (filter === "synced") return p.isSynced;
    return true;
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.add(p.id));
        return next;
      });
    }
  }

  async function syncPhotos(ids: string[]) {
    if (ids.length === 0) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_selected", asset_ids: ids }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncResult(`${data.synced} photo${data.synced !== 1 ? "s" : ""} synced to Google`);
        // Update local state
        setPhotoList((prev) => prev.map((p) => ids.includes(p.id) ? { ...p, isSynced: true, syncedAt: new Date().toISOString() } : p));
        setSelected(new Set());
      } else {
        setSyncResult(data.error || "Sync failed");
      }
    } catch {
      setSyncResult("Sync failed");
    }
    setSyncing(false);
    setTimeout(() => setSyncResult(null), 4000);
  }

  async function setCoverPhoto(assetId: string, url: string) {
    await fetch(`/api/admin/sites/${siteId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_cover", sourceUrl: url }),
    });
    await fetch("/api/google/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: siteId, gbp_cover_asset_id: assetId }),
    });
    setCurrentCover({ id: assetId, url });
    setPickerOpen(null);
  }

  const ribbonIds = photoList.filter((p) => p.isBlueRibbon && !p.isSynced).map((p) => p.id);

  return (
    <div className="p-4">
      {/* Cover + Logo */}
      <div className="mb-4 grid grid-cols-[1fr_auto] gap-4">
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

        <a
          href="/dashboard/settings"
          className="relative h-36 w-36 overflow-hidden rounded-xl bg-surface-hover group border border-border block"
        >
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-[10px] text-muted text-center px-2">No logo set</p>
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <span className="text-xs text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              Manage in Settings
            </span>
          </div>
          <span className="absolute top-2 left-2 rounded bg-black/50 px-2 py-0.5 text-[9px] text-white">
            Logo · 250×250
          </span>
        </a>
      </div>

      {/* Cover picker modal */}
      {pickerOpen && (
        <ImagePicker
          images={photoList}
          currentId={currentCover.id}
          title="Select Cover Photo"
          onSelect={(id, url) => setCoverPhoto(id, url)}
          onClose={() => setPickerOpen(null)}
        />
      )}

      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Select all */}
          <button
            onClick={toggleSelectAll}
            className={`rounded border px-3 py-1.5 text-[10px] font-medium transition-colors ${
              allFilteredSelected
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {allFilteredSelected ? "Deselect All" : "Select All"}
          </button>

          {/* Filters */}
          <div className="flex gap-1 ml-2">
            {([
              { key: "all" as const, label: "All", count: totalCount },
              { key: "ribbon" as const, label: "Blue Ribbon", count: blueRibbonCount },
              { key: "synced" as const, label: "Synced", count: syncedCount },
            ]).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1 text-[10px] font-medium transition-colors ${
                  filter === f.key
                    ? "bg-accent text-white"
                    : "bg-surface-hover text-muted hover:text-foreground"
                }`}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {syncResult && <span className="text-xs text-accent">{syncResult}</span>}

          {selected.size > 0 && (
            <button
              onClick={() => syncPhotos(Array.from(selected))}
              disabled={syncing}
              className="rounded bg-accent px-3 py-1.5 text-[10px] font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {syncing ? "Syncing..." : `Sync Selected (${selected.size})`}
            </button>
          )}

          {ribbonIds.length > 0 && (
            <button
              onClick={() => syncPhotos(ribbonIds)}
              disabled={syncing}
              className="rounded border border-accent px-3 py-1.5 text-[10px] font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
            >
              {syncing ? "Syncing..." : `Sync Blue Ribbon (${ribbonIds.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Photo grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="▣"
          title="No photos"
          description={filter === "synced" ? "No photos synced to Google yet." : filter === "ribbon" ? "No blue ribbon photos." : "No photos in the media library."}
        />
      ) : (
        <div className="grid grid-cols-5 gap-3">
          {filtered.map((photo) => (
            <div
              key={photo.id}
              onClick={() => toggleSelect(photo.id)}
              className={`group relative aspect-square overflow-hidden rounded-lg cursor-pointer border-2 transition-colors ${
                selected.has(photo.id)
                  ? "border-accent ring-2 ring-accent/20"
                  : "border-transparent hover:border-accent/30"
              }`}
            >
              <img src={photo.storageUrl} alt="" className="h-full w-full object-cover" />

              {/* Selection checkmark */}
              {selected.has(photo.id) && (
                <div className="absolute top-1.5 left-1.5 h-5 w-5 rounded-full bg-accent flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}

              {/* Unselected circle */}
              {!selected.has(photo.id) && (
                <div className="absolute top-1.5 left-1.5 h-5 w-5 rounded-full border-2 border-white/50 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}

              {/* Blue ribbon badge */}
              {photo.isBlueRibbon && (
                <div className="absolute top-1.5 right-1.5 rounded bg-blue-500 px-1.5 py-0.5 text-[8px] font-bold text-white shadow">
                  ★
                </div>
              )}

              {/* Synced badge / unsync action */}
              {photo.isSynced && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!await confirm({ title: "Remove this photo from Google?", confirmLabel: "Remove", danger: true })) return;
                    fetch(`/api/admin/sites/${siteId}/photos`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "unsync", asset_id: photo.id }),
                    }).then((res) => {
                      if (res.ok) {
                        setPhotoList((prev) => prev.map((p) => p.id === photo.id ? { ...p, isSynced: false, syncedAt: null } : p));
                        setSyncResult("Photo removed from Google");
                        setTimeout(() => setSyncResult(null), 3000);
                      }
                    });
                  }}
                  className="absolute bottom-1.5 right-1.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[8px] font-medium text-white shadow group-hover:bg-red-500 transition-colors"
                  title="Remove from Google"
                >
                  <span className="group-hover:hidden">Synced</span>
                  <span className="hidden group-hover:inline">Unsync</span>
                </button>
              )}

              {/* Quality score on hover */}
              <div className="absolute bottom-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
                  {Math.round(photo.qualityScore * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
