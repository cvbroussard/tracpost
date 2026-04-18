"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { key: "overview", label: "Overview", path: "/google" },
  { key: "reviews", label: "Reviews", path: "/google/reviews" },
  { key: "performance", label: "Performance", path: "/google/performance" },
  { key: "profile", label: "Profile", path: "/google/profile" },
  { key: "photos", label: "Photos", path: "/google/photos" },
];

export function GoogleTabs() {
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
            ? pathname === prefix + "/google" || pathname === prefix + "/google/"
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
