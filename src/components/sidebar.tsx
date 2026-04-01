"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarBrand } from "./sidebar-brand";

interface SiteInfo {
  id: string;
  name: string;
  url: string;
}

const siteNav = [
  { label: "Dashboard", path: "", icon: "◆" },
  { label: "Brand", path: "/brand", icon: "◈" },
  { label: "Capture", path: "/capture", icon: "◎" },
  { label: "Media", path: "/media", icon: "▣" },
  { label: "Calendar", path: "/calendar", icon: "▦" },
  { label: "Inbox", path: "/inbox", icon: "▤" },
  { label: "Blog", path: "/blog", icon: "✎" },
  { label: "SEO", path: "/seo", icon: "◇" },
  { label: "Spotlight", path: "/spotlight", icon: "✦" },
  { label: "Analytics", path: "/analytics", icon: "▥" },
  { label: "Connections", path: "/accounts", icon: "◉" },
  { label: "Settings", path: "/settings", icon: "⚙" },
];

const accountNav = [
  { label: "My Account", path: "/account", icon: "◯" },
  { label: "Vendors", path: "/account/vendors", icon: "◫" },
  { label: "Mobile App", path: "/account/mobile-app", icon: "◱" },
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
  const siteLinks = siteNav.map((item) => ({ ...item, href: prefix + item.path || "/" }));
  const accountLinks = accountNav.map((item) => ({ ...item, href: prefix + item.path || "/" }));

  const handleSiteChange = async (siteId: string) => {
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeSiteId: siteId || null }),
    });
    window.location.href = "/dashboard";
  };

  return (
    <aside className="flex h-full w-48 flex-col border-r border-border bg-surface">
      <SidebarBrand
        subscriberName={subscriberName}
        sites={sites}
        activeSiteId={activeSiteId}
        onSiteChange={handleSiteChange}
      />
      <nav className="flex flex-1 flex-col px-2 py-3">
        {activeSiteId ? (
          <>
            <div className="flex flex-col gap-0.5">
              {siteLinks.map((item) => {
                const fullPath = prefix + item.path;
                const active =
                  item.path === ""
                    ? pathname === prefix || pathname === prefix + "/"
                    : pathname === fullPath || pathname === fullPath + "/";
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
            </div>
            <div className="mx-3 my-2 border-t border-border" />
          </>
        ) : (
          <div className="mb-2 px-3 py-2">
            <p className="text-[10px] text-muted">Select a site to access content tools</p>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          {accountLinks.map((item) => {
            const fullPath = prefix + item.path;
            const active = pathname === fullPath || pathname === fullPath + "/";
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
        </div>
      </nav>
    </aside>
  );
}
