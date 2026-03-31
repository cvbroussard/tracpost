"use client";

import { useRouter } from "next/navigation";

interface Counts {
  total: number;
  uploads: number;
  ai_generated: number;
  high_quality: number;
  medium_quality: number;
  low_quality: number;
}

export function MediaFilters({
  sourceFilter,
  sceneFilter,
  qualityFilter,
  sortOrder,
  counts,
}: {
  sourceFilter: string;
  sceneFilter: string;
  qualityFilter: string;
  sortOrder: string;
  counts: Counts;
}) {
  const router = useRouter();

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams();
    const merged = {
      source: sourceFilter,
      scene: sceneFilter,
      quality: qualityFilter,
      sort: sortOrder,
      ...updates,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "all" && v !== "newest") {
        params.set(k, v);
      }
    }
    const qs = params.toString();
    router.push(`/dashboard/media${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
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

      {/* Scene type filter */}
      <select
        value={sceneFilter}
        onChange={(e) => updateParams({ scene: e.target.value })}
        className="bg-surface-hover px-2 py-1 text-[10px] text-muted"
      >
        <option value="all">All scenes</option>
        <option value="humans">Humans</option>
        <option value="environment">Environment</option>
        <option value="product">Product</option>
        <option value="method">Method</option>
        <option value="region">Region</option>
      </select>

      {/* Quality filter */}
      <select
        value={qualityFilter}
        onChange={(e) => updateParams({ quality: e.target.value })}
        className="bg-surface-hover px-2 py-1 text-[10px] text-muted"
      >
        <option value="all">All quality</option>
        <option value="high">High 80%+ ({counts.high_quality})</option>
        <option value="medium">Medium 50-79% ({counts.medium_quality})</option>
        <option value="low">Low &lt;50% ({counts.low_quality})</option>
      </select>

      {/* Sort */}
      <select
        value={sortOrder}
        onChange={(e) => updateParams({ sort: e.target.value })}
        className="bg-surface-hover px-2 py-1 text-[10px] text-muted"
      >
        <option value="newest">Newest</option>
        <option value="quality">Quality</option>
        <option value="least_used">Least used</option>
      </select>
    </div>
  );
}
