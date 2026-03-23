"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarBrand } from "./sidebar-brand";

interface SiteInfo {
  id: string;
  name: string;
  url: string;
}

const baseNav = [
  { label: "Dashboard", path: "", icon: "◆" },
  { label: "Brand", path: "/brand", icon: "◈" },
  { label: "Capture", path: "/capture", icon: "◎" },
  { label: "Media", path: "/media", icon: "▣" },
  { label: "Calendar", path: "/calendar", icon: "▦" },
  { label: "Inbox", path: "/inbox", icon: "▤" },
  { label: "SEO", path: "/seo", icon: "◇" },
  { label: "Spotlight", path: "/spotlight", icon: "✦" },
  { label: "Analytics", path: "/analytics", icon: "▥" },
  { label: "Accounts", path: "/accounts", icon: "◉" },
  { label: "Settings", path: "/settings", icon: "⚙" },
  { label: "My Account", path: "/account", icon: "◯" },
];

interface SidebarProps {
  subscriberName: string;
  sites: SiteInfo[];
  activeSiteId: string | null;
}

export function Sidebar({ subscriberName, sites, activeSiteId }: SidebarProps) {
  const pathname = usePathname();

  const isSubdomain =
    typeof window !== "undefined" &&
    window.location.hostname === "studio.tracpost.com";
  const prefix = isSubdomain ? "" : "/dashboard";
  const nav = baseNav.map((item) => ({
    ...item,
    href: prefix + item.path || "/",
  }));

  const handleSiteChange = async (siteId: string) => {
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeSiteId: siteId }),
    });
    window.location.reload();
  };

  return (
    <aside className="flex h-full w-48 flex-col border-r border-border bg-surface">
      <SidebarBrand
        subscriberName={subscriberName}
        sites={sites}
        activeSiteId={activeSiteId}
        onSiteChange={handleSiteChange}
      />
      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-3">
        {nav.map((item) => {
          const active =
            item.path === ""
              ? pathname === prefix || pathname === prefix + "/"
              : pathname.startsWith(prefix + item.path);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                active
                  ? "bg-accent-muted text-accent"
                  : "text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              <span className="text-xs">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
