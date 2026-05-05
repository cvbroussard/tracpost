"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  accountId: string;
  sites: Array<{ id: string; name: string }>;
  linkedSiteIds: string[];
}

export function LinkAccountForm({ accountId, sites, linkedSiteIds }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const unlinkedSites = sites.filter((s) => !linkedSiteIds.includes(s.id));

  async function linkSite(siteId: string) {
    setLoading(true);
    try {
      await fetch("/api/social-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ social_account_id: accountId, site_id: siteId }),
      });

      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (unlinkedSites.length === 0) return null;

  return (
    <div className="mt-2 flex items-center gap-2">
      {unlinkedSites.map((site) => (
        <button
          key={site.id}
          onClick={() => linkSite(site.id)}
          disabled={loading}
          className="rounded border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          + Link to {site.name}
        </button>
      ))}
    </div>
  );
}
