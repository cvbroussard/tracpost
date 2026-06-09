/**
 * Read-only display of a brand's canonical GBP category assignment.
 * Embedded in the provisioning drawer's brand_categorization scope.
 *
 * Per the theoretical model established for categorization:
 *   - Categorization is platform-owned (tenant never picks)
 *   - business_gbp_categories is THE canonical store
 *   - Tenant SEES the result with reasoning ("we picked this because…")
 *   - Updates happen via the two writers (Pipeline A auto or Pipeline B
 *     coaching ceremony), surfaced as drawer actions
 *
 * This display is the "see the result" part — read-only on purpose.
 */
"use client";

import { useState, useEffect, useCallback } from "react";

interface GbpCategory {
  gcid: string;
  name: string;
  isPrimary: boolean;
  chosenBy: string | null;
  chosenAt: string | null;
}

export function GbpCategoriesDisplay({ businessId }: { businessId: string }) {
  const [categories, setCategories] = useState<GbpCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/businesses/${businessId}/gbp-categories`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { categories: GbpCategory[] };
      setCategories(data.categories);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return <p className="text-[11px] text-muted italic">Loading categories…</p>;
  }

  if (error) {
    return <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>;
  }

  if (categories.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/40 px-3 py-4 text-center">
        <p className="text-[11px] text-muted leading-relaxed">
          No categories assigned yet. Run the coaching ceremony or re-categorize
          from catalog (actions below) to derive this brand&apos;s primary +
          additional GBP categories.
        </p>
      </div>
    );
  }

  const primary = categories.find((c) => c.isPrimary);
  const additional = categories.filter((c) => !c.isPrimary);

  // Provenance summary — the latest chosen_at + the chosen_by source.
  const latest = categories.reduce<GbpCategory | null>((acc, c) => {
    if (!c.chosenAt) return acc;
    if (!acc || (acc.chosenAt && c.chosenAt > acc.chosenAt)) return c;
    return acc;
  }, null);
  const chosenBy = latest?.chosenBy;
  const chosenAt = latest?.chosenAt;
  const provenanceLabel =
    chosenBy === "coaching" ? "Coaching ceremony" :
    chosenBy === null || chosenBy === undefined ? "Unknown source" :
    chosenBy;

  return (
    <div className="space-y-3">
      {/* Provenance line */}
      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>
          Source: <span className="font-medium text-foreground">{provenanceLabel}</span>
          {chosenAt && (
            <span className="ml-1">
              · {new Date(chosenAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
        </span>
        <span className="font-mono">{categories.length} {categories.length === 1 ? "category" : "categories"}</span>
      </div>

      {/* Primary category */}
      {primary && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="inline-flex items-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              Primary
            </span>
            <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
              {primary.name}
            </span>
          </div>
          <p className="text-[10px] text-emerald-700/70 dark:text-emerald-300/70 font-mono">
            {primary.gcid}
          </p>
        </div>
      )}

      {/* Additional categories */}
      {additional.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted font-medium">
            Additional ({additional.length})
          </p>
          <ul className="rounded-md border border-border divide-y divide-border overflow-hidden">
            {additional.map((c) => (
              <li
                key={c.gcid}
                className="px-3 py-1.5 flex items-center justify-between text-xs"
              >
                <span className="text-foreground">{c.name}</span>
                <span className="text-[10px] text-muted/60 font-mono shrink-0 ml-2">{c.gcid}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[10px] text-muted italic">
        Read-only. Categorization is platform-owned — use the actions below to
        regenerate.
      </p>
    </div>
  );
}
