"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SCENE_TYPES } from "@/lib/scene-types";

interface Counts {
  total: number;
  uploads: number;
  ai_generated: number;
  pending_briefing: number;
}

interface ProjectOption {
  id: string;
  name: string;
}

export function MediaFilters({
  search,
  sourceFilter,
  mediaTypeFilter,
  sceneFilter,
  sortOrder,
  projectFilter,
  briefingFilter,
  showArchived,
  counts,
  projects = [],
}: {
  search: string;
  sourceFilter: string;
  mediaTypeFilter: string;
  sceneFilter: string;
  sortOrder: string;
  projectFilter: string;
  briefingFilter: string;
  showArchived: boolean;
  counts: Counts;
  projects?: ProjectOption[];
}) {
  const _router = useRouter();
  const [searchInput, setSearchInput] = useState(search);

  // On mount: restore persisted preferences if no explicit URL params
  // Only runs on the media page (check pathname to avoid redirecting wrong pages)
  if (typeof window !== "undefined") {
    try {
      const url = new URL(window.location.href);
      const isMediaPage = url.pathname.includes("/media");
      if (isMediaPage) {
        let needsRedirect = false;
        const persistedSort = localStorage.getItem("tp_media_sort");
        if (persistedSort && !url.searchParams.has("sort") && persistedSort !== "newest") {
          url.searchParams.set("sort", persistedSort);
          needsRedirect = true;
        }
        const persistedProject = localStorage.getItem("tp_media_project");
        if (persistedProject && !url.searchParams.has("project")) {
          url.searchParams.set("project", persistedProject);
          needsRedirect = true;
        }
        if (needsRedirect) {
          window.location.href = url.toString();
        }
      }
    } catch { /* ignore */ }
  }

  function persist(key: string, value: string) {
    try { localStorage.setItem(`tp_media_${key}`, value); } catch { /* ignore */ }
  }

  function updateParams(updates: Record<string, string>) {
    if (updates.sort) persist("sort", updates.sort);
    if (updates.project !== undefined) persist("project", updates.project);
    const params = new URLSearchParams();
    const merged = {
      q: search,
      source: sourceFilter,
      type: mediaTypeFilter,
      scene: sceneFilter,
      sort: sortOrder,
      project: projectFilter,
      briefing: briefingFilter,
      archived: showArchived ? "true" : "",
      ...updates,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "all" && v !== "newest") {
        params.set(k, v);
      }
    }
    const qs = params.toString();
    const url = `/dashboard/media${qs ? `?${qs}` : ""}`;
    window.location.href = url;
  }

  function submitSearch() {
    if (searchInput.trim() === search) return;
    updateParams({ q: searchInput.trim() });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {/* Search input — primary navigation aid for libraries that scale to
          thousands of source assets. Matches against context_note (caption).
          Submit on Enter, clear with Esc. Submission triggers a server
          re-query so the filter operates on the full library, not the
          200-asset slice. */}
      <div className="relative">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitSearch();
            if (e.key === "Escape" && searchInput) {
              setSearchInput("");
              updateParams({ q: "" });
            }
          }}
          onBlur={submitSearch}
          placeholder="Search captions…"
          className="w-48 rounded border border-border bg-surface px-2 py-1 text-[11px] text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        {search && search === searchInput && (
          <button
            onClick={() => { setSearchInput(""); updateParams({ q: "" }); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted hover:text-foreground"
            title="Clear search"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Archived filter chip per project_tracpost_deletion_policy.md.
          Toggles ?archived=true to reveal soft-deleted assets so subscribers
          can restore them. Off by default. */}
      <button
        onClick={() => updateParams({ archived: showArchived ? "" : "true" })}
        className={`rounded px-2.5 py-1 text-[10px] font-medium transition-colors border ${
          showArchived
            ? "bg-muted text-white border-muted"
            : "bg-transparent text-muted border-border hover:text-foreground"
        }`}
        title={showArchived ? "Hide archived" : "Show archived assets"}
      >
        {showArchived ? "✓ Archived" : "Archived"}
      </button>

      {/* Briefing-required filter — high-priority chip per migrate-099.
          Only renders when there's something to brief; surfaces the gap. */}
      {counts.pending_briefing > 0 && (
        <button
          onClick={() => updateParams({ briefing: briefingFilter === "pending" ? "all" : "pending" })}
          className={`rounded px-2.5 py-1 text-[10px] font-medium transition-colors border ${
            briefingFilter === "pending"
              ? "bg-amber-500 text-white border-amber-600"
              : "bg-amber-500/15 text-amber-400 border-amber-500/40 hover:bg-amber-500/25"
          }`}
        >
          Needs briefing
          <span className={`ml-1 ${briefingFilter === "pending" ? "text-white/80" : "text-amber-400/80"}`}>
            {counts.pending_briefing}
          </span>
        </button>
      )}

      {/* Source filter */}
      <div className="flex gap-1">
        {([
          { value: "all", label: "All", count: counts.total },
          { value: "upload", label: "Uploads", count: counts.uploads },
          { value: "ai_generated", label: "AI", count: counts.ai_generated },
        ]).map((opt) => (
          <button
            key={opt.value}
            onClick={() => updateParams({ source: opt.value })}
            className={`rounded px-2.5 py-1 text-[10px] font-medium transition-colors ${
              sourceFilter === opt.value
                ? "bg-accent text-white"
                : "bg-surface-hover text-muted hover:text-foreground"
            }`}
          >
            {opt.label}
            {opt.count > 0 && (
              <span className={`ml-1 ${sourceFilter === opt.value ? "text-white/70" : "text-muted"}`}>
                {opt.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Media type filter */}
      <select
        key="media-type"
        value={mediaTypeFilter}
        onChange={(e) => updateParams({ type: e.target.value })}
        className="bg-surface-hover px-2 py-1 text-[10px] text-muted"
      >
        <option value="all">All types</option>
        <option value="image">Images</option>
        <option value="video">Videos</option>
        <option value="pdf">PDFs</option>
      </select>

      {/* Scene composition filter — uses platform-wide vocabulary
          (src/lib/scene-types.ts) and queries against the scene_types
          array column on media_assets, not the legacy ai_analysis.scene_type
          string. */}
      <select
        key="scene-type"
        value={sceneFilter}
        onChange={(e) => updateParams({ scene: e.target.value })}
        className="bg-surface-hover px-2 py-1 text-[10px] text-muted"
      >
        <option value="all">All scenes</option>
        {SCENE_TYPES.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>

      {/* Quality filter removed — operator-tier signal, no subscriber
          affordance. Still visible on /manage/asset-health. */}

      {/* Sort */}
      <select
        key="sort"
        value={sortOrder}
        onChange={(e) => updateParams({ sort: e.target.value })}
        className="bg-surface-hover px-2 py-1 text-[10px] text-muted"
      >
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="least_used">Least used</option>
      </select>

      {/* Project filter */}
      {projects.length > 0 && (
        <select
          key="project"
          value={projectFilter}
          onChange={(e) => updateParams({ project: e.target.value })}
          className="bg-surface-hover px-2 py-1 text-[10px] text-muted"
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
