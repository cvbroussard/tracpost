"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface InboxTabsProps {
  siteId: string;
}

const TABS = [
  { key: "comments", label: "Comments", path: "/inbox/comments" },
  { key: "reviews", label: "Reviews", path: "/inbox/reviews" },
  { key: "messages", label: "Messages", path: "/inbox/messages" },
];

export function InboxTabs({ siteId }: InboxTabsProps) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    async function fetchCounts() {
      try {
        const res = await fetch(`/api/inbox/counts?site_id=${siteId}`);
        if (res.ok) setCounts(await res.json());
      } catch { /* ignore */ }
    }

    fetchCounts();
    const interval = setInterval(fetchCounts, 60000);
    return () => clearInterval(interval);
  }, [siteId]);

  const isSubdomain =
    typeof window !== "undefined" &&
    window.location.hostname === "studio.tracpost.com";
  const prefix = isSubdomain ? "" : "/dashboard";

  return (
    <div className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const href = prefix + tab.path;
        const active = pathname.includes(tab.path);
        const count = counts[tab.key] || 0;
        return (
          <Link
            key={tab.key}
            href={href}
            className={`relative px-4 py-2.5 text-sm transition-colors ${
              active
                ? "border-b-2 border-accent text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
            {count > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 text-xs text-white">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
