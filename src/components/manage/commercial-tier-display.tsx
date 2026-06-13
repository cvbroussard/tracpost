/**
 * CommercialTierDisplay — read-only render of the brand's declared
 * commercial tier in the brand_cma drawer body. Owner is the canonical
 * author; operator observes. Emits the slug back so the drawer can gate
 * the "Run Analysis" action on declaration.
 *
 * Per Cat 1 Home Rule ([[gbp-field-categorization]]): commercial_tier
 * homes on the CMA card (the consumer that hard-blocks without it). Per
 * the role-split + agency-advisory doctrine: owner-canonical; coaching
 * or audit variations happen with the owner in the loop, not by operator
 * override.
 */
"use client";

import { useEffect, useState } from "react";

interface PickerTier {
  id: string;
  slug: string;
  label: string;
  description: string;
}

export function CommercialTierDisplay({
  businessId,
  onTierChange,
}: {
  businessId: string;
  /** Fired on initial load. null = not declared. */
  onTierChange?: (slug: string | null) => void;
}) {
  const [tier, setTier] = useState<PickerTier | null>(null);
  const [declared, setDeclared] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/businesses/${businessId}/info`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const slug: string | null = data.business?.tierSlug ?? null;
        const match = slug ? (data.pickerTiers ?? []).find((t: PickerTier) => t.slug === slug) ?? null : null;
        setTier(match);
        setDeclared(Boolean(slug));
        onTierChange?.(slug || null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load tier.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  if (loading) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>;
  }
  if (error) {
    return <div className="text-sm text-rose-600 dark:text-rose-400">{error}</div>;
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Commercial tier
      </div>
      {declared && tier ? (
        <>
          <div className="text-sm text-slate-900 dark:text-slate-100 font-medium">
            {tier.label}
          </div>
          {tier.description && (
            <p className="text-[10px] text-muted leading-relaxed italic">
              {tier.description}
            </p>
          )}
        </>
      ) : (
        <div className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 space-y-1">
          <div className="text-xs font-medium text-amber-800 dark:text-amber-300">
            Awaiting owner declaration
          </div>
          <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
            CMA classifies competitors against the brand's declared tier and
            cannot run until the owner has declared it. Coach the owner to
            select a tier in their dashboard.
          </p>
        </div>
      )}
      <p className="text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700">
        Owner-authored. Coaching + audit variations happen with the owner in the loop.
      </p>
    </div>
  );
}
