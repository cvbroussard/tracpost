/**
 * BusinessInfoDisplay — Cat 1 baseline-checklist render of the business_info
 * card. Surfaces the 4 flat field-level sub_tasks (name, business_type,
 * location, url) per the migration 165 reshape (2026-06-14). Drawer
 * count + card badge both read X/4. Read-only by construction: editing
 * happens via the tenant surface.
 *
 * Cat 2 sub_tasks live at their consumer cards:
 * - commercial tier → CMA card (Cat 1 but Home-Rule consumer = CMA)
 * - hosting model + logo + favicon → Website card
 * - contact (phone/email) → GBP card
 * - safeguards × 3 → Studio content-gen card
 *
 * See [[tracpost-agency-scope]] for the metrics-vs-artistic scope line
 * that drives this classification.
 */
"use client";

import { useEffect, useState } from "react";

interface BusinessInfo {
  name: string | null;
  businessType: string | null;
  location: string | null;
  websiteUrl: string | null;
}

export function BusinessInfoDisplay({ businessId }: { businessId: string }) {
  const [biz, setBiz] = useState<BusinessInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/businesses/${businessId}/info`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setBiz(data.business);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  if (loading) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Loading…</div>;
  }
  if (!biz) {
    return <div className="text-sm text-rose-600 dark:text-rose-400">Failed to load business info.</div>;
  }

  const fields = [
    { label: "Business name", value: biz.name, link: false },
    { label: "Business type", value: biz.businessType, link: false },
    { label: "Location", value: biz.location, link: false },
    { label: "Website URL", value: biz.websiteUrl, link: true },
  ];
  const completeCount = fields.filter((f) => !!f.value).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-slate-700 dark:text-slate-300">
          Baseline checklist
        </h4>
        <span className="text-[10px] font-mono text-muted">{completeCount}/4 complete</span>
      </div>

      {fields.map((f) => (
        <FieldRow key={f.label} label={f.label} value={f.value} link={f.link} />
      ))}

      <p className="text-[10px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
        Cat 1 load-bearing baseline. Owner-authored; edits happen at the tenant dashboard.
      </p>
    </div>
  );
}

function FieldRow({
  label,
  value,
  link,
}: {
  label: string;
  value: string | null;
  link: boolean;
}) {
  const complete = !!value;
  return (
    <div className="flex items-center gap-2 rounded border border-slate-200 dark:border-slate-700 bg-card/30 px-3 py-2">
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          complete ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-foreground shrink-0">{label}</p>
          {value ? (
            link ? (
              <a
                href={value}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline truncate"
              >
                {value}
              </a>
            ) : (
              <span className="text-[10px] text-foreground truncate">{value}</span>
            )
          ) : (
            <span className="text-[10px] text-slate-400 italic">not declared</span>
          )}
        </div>
      </div>
    </div>
  );
}

