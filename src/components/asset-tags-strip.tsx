"use client";

/**
 * Asset tags strip — compact confirmation row of what's attached to
 * the asset right now. Sits between the source media and the variants
 * thumbnails so that the moment a subscriber clicks Save, they see
 * visual confirmation of every entity that just landed (category, brands,
 * projects, service areas).
 *
 * Reads the same `CategoriesResponse` shape AssetCategoriesSection
 * already loads — passed down from the modal via onDataChange. No
 * extra fetch.
 *
 * Hides entirely when there's nothing to show (pre-briefing asset).
 */

import type { CategoriesResponse } from "./asset-categories-section";

interface Props {
  data: CategoriesResponse | null;
}

export function AssetTagsStrip({ data }: Props) {
  if (!data) return null;

  const primary = data.assignments.find((a) => a.is_primary);
  const secondaries = data.assignments.filter((a) => !a.is_primary);
  const brands = data.committed?.brands ?? [];
  const projects = data.committed?.projects ?? [];
  const serviceAreas = data.committed?.service_areas ?? [];

  const hasAnything =
    primary !== undefined ||
    secondaries.length > 0 ||
    brands.length > 0 ||
    projects.length > 0 ||
    serviceAreas.length > 0;
  if (!hasAnything) return null;

  return (
    <div className="mb-3 rounded border border-border bg-background px-3 py-2">
      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted/70">
        Tagged
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {primary && (
          <span
            className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
            title={`Primary category${primary.confidence != null ? ` · ${(Number(primary.confidence) * 100).toFixed(0)}% confidence` : ""}`}
          >
            ★ {primary.name}
          </span>
        )}
        {secondaries.map((s) => (
          <span
            key={s.gcid}
            className="rounded-full bg-accent/5 px-2 py-0.5 text-[10px] text-accent/80"
            title="Secondary category"
          >
            {s.name}
          </span>
        ))}
        {brands.map((b) => (
          <span
            key={`brand-${b.slug}`}
            className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-600 dark:text-blue-400"
            title="Brand"
          >
            ◆ {b.name}
          </span>
        ))}
        {projects.map((p) => (
          <span
            key={`project-${p.slug}`}
            className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-600 dark:text-purple-400"
            title="Project"
          >
            ▣ {p.name}
          </span>
        ))}
        {serviceAreas.map((sa, i) => (
          <span
            key={`area-${sa.name}-${i}`}
            className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400"
            title={`Service area (matched via ${sa.source})`}
          >
            📍 {sa.name}
          </span>
        ))}
      </div>
    </div>
  );
}
