/**
 * BusinessInfoDisplay — read-only render of the business_info Cat 1 fields
 * for the operator provisioning drawer. Per the 3-category field doctrine
 * (see project_tracpost_gbp_field_categorization), the drawer surfaces only
 * Cat 1 (shapes what the brand IS) and edits only platform-authored fields.
 * All 5 Cat 1 fields in business_info are owner-authored → fully read-only.
 *
 * Replaces the earlier BusinessInfoForm in the operator drawer; the form
 * stays around as a reference for the tenant-side editing surface.
 */
"use client";

import { useEffect, useState } from "react";

interface BusinessInfo {
  name: string | null;
  businessType: string | null;
  location: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
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

  return (
    <div className="space-y-4">
      <Row label="Business name" value={biz.name} />
      <Row label="Business type" value={biz.businessType} />
      <Row label="Location" value={biz.location} />
      <LinkRow label="Website URL" url={biz.websiteUrl} />
      <ImageRow label="Logo" url={biz.logoUrl} />
      <ImageRow label="Favicon" url={biz.faviconUrl} />
      <p className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
        Owner-authored brand identity. Edits happen in the tenant dashboard.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
        {label}
      </div>
      <div className="text-sm text-slate-900 dark:text-slate-100">
        {value || <span className="text-slate-400 italic">not declared</span>}
      </div>
    </div>
  );
}

function LinkRow({ label, url }: { label: string; url: string | null }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
        {label}
      </div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-sky-600 dark:text-sky-400 hover:underline break-all"
        >
          {url}
        </a>
      ) : (
        <div className="text-sm text-slate-400 italic">not declared</div>
      )}
    </div>
  );
}

function ImageRow({ label, url }: { label: string; url: string | null }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
        {label}
      </div>
      {url ? (
        <div className="flex items-center gap-3">
          <img
            src={url}
            alt={label}
            className="h-12 w-12 object-contain border border-slate-200 dark:border-slate-700 rounded bg-white"
          />
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-sky-600 dark:text-sky-400 hover:underline truncate max-w-[20rem]"
          >
            {url}
          </a>
        </div>
      ) : (
        <div className="text-sm text-slate-400 italic">not declared</div>
      )}
    </div>
  );
}
