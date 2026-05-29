"use client";
import { useState, useEffect } from "react";
import { ManagePage } from "@/components/manage/manage-page";
function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-[10px] text-muted">{label}</span>
      <span className="text-xs font-medium">{String(value)}</span>
    </div>
  );
}
function QualityContent({ siteId }: { siteId: string }) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    fetch(`/api/ops/site?site_id=${siteId}&view=overview`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setCounts(d?.counts || null));
  }, [siteId]);
  if (!counts) return <div className="flex justify-center py-12"><div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>;
  return (
    <div className="p-4">
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card max-w-md">
        <h3 className="text-sm font-medium mb-3">Quality Gates</h3>
        <Row label="Content Guard" value="Active" />
        <Row label="Quality Cutoff" value="0.7" />
        <Row label="Image Corrections" value={counts.corrections || 0} />
        <Row label="URL Validation" value="Active" />
        <Row label="Vendor Detection" value={`${counts.vendors || 0} vendors`} />
      </div>
    </div>
  );
}
export default function Page() {
  return <ManagePage title="Quality Gates" requireSite>{({ siteId }) => <QualityContent siteId={siteId} />}</ManagePage>;
}
