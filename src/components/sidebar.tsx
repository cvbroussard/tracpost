"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SiteInfo {
  id: string;
  name: string;
  url: string;
}

const siteNav = [
  { label: "Dashboard", path: "", icon: "◆" },
  { label: "Unipost", path: "/unipost", icon: "◈" },
  { label: "Brand", path: "/brand", icon: "◇" },
  { label: "Capture", path: "/capture", icon: "◎" },
  { label: "Media", path: "/media", icon: "▣" },
  { label: "Entities", path: "/entities", icon: "◫" },
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
  { label: "Team", path: "/account/team", icon: "◱" },
  { label: "Subscription", path: "/account/subscription", icon: "◈" },
];

// Role-based nav visibility
const MANAGER_SITE_PATHS = new Set(["", "/brand", "/calendar", "/inbox", "/blog", "/entities"]);
const MANAGER_ACCOUNT_PATHS = new Set(["/account"]);

interface SidebarProps {
  userName: string;
  sites: SiteInfo[];
  activeSiteId: string | null;
  role?: string;
}

export function Sidebar({ userName, sites, activeSiteId, role = "owner" }: SidebarProps) {
  const pathname = usePathname();

  const isSubdomain =
    typeof window !== "undefined" &&
    window.location.hostname === "studio.tracpost.com";
  const prefix = isSubdomain ? "" : "/dashboard";

  const filteredSiteNav = role === "manager"
    ? siteNav.filter((item) => MANAGER_SITE_PATHS.has(item.path))
    : siteNav;

  const filteredAccountNav = role === "manager"
    ? accountNav.filter((item) => MANAGER_ACCOUNT_PATHS.has(item.path))
    : accountNav;

  const siteLinks = filteredSiteNav.map((item) => ({ ...item, href: prefix + item.path || "/" }));
  const accountLinks = filteredAccountNav.map((item) => ({ ...item, href: prefix + item.path || "/" }));

  return (
    <aside className="flex h-full w-48 flex-col border-r border-border bg-surface">
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
