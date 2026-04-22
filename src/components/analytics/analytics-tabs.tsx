"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { key: "overview", label: "Overview", path: "/analytics" },
  { key: "acquisition", label: "Acquisition", path: "/analytics/acquisition" },
  { key: "engagement", label: "Engagement", path: "/analytics/engagement" },
  { key: "audience", label: "Audience", path: "/analytics/audience" },
  { key: "search", label: "Search", path: "/analytics/search" },
  { key: "conversions", label: "Conversions", path: "/analytics/conversions" },
];

export function AnalyticsTabs() {
  const pathname = usePathname();

  const isSubdomain =
    typeof window !== "undefined" &&
    window.location.hostname === "studio.tracpost.com";
  const prefix = isSubdomain ? "" : "/dashboard";

  return (
    <div className="flex gap-1">
      {TABS.map((tab) => {
        const href = prefix + tab.path;
        const active =
          tab.key === "overview"
            ? pathname === prefix + "/analytics" || pathname === prefix + "/analytics/"
            : pathname.startsWith(prefix + tab.path);
        return (
          <Link
            key={tab.key}
            href={href}
            className={`px-4 py-2.5 text-sm transition-colors ${
              active
                ? "border-b-2 border-accent text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
