"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface SiteInfo {
  id: string;
  name: string;
  url: string;
}

interface SubItem {
  label: string;
  path: string;
}

interface Module {
  label: string;
  path: string;
  icon: string;
  subs: SubItem[];
}

const MODULES: Module[] = [
  {
    label: "Configure",
    path: "/configure",
    icon: "⚙",
    subs: [
      { label: "Brand", path: "/brand" },
      { label: "Connections", path: "/accounts" },
      { label: "Google Profile", path: "/google/profile" },
      { label: "Entities", path: "/entities" },
      { label: "Settings", path: "/settings" },
    ],
  },
  {
    label: "Publish",
    path: "/publish",
    icon: "◎",
    subs: [
      { label: "Capture", path: "/capture" },
      { label: "Media", path: "/media" },
      { label: "Blog", path: "/blog" },
      { label: "Unipost", path: "/unipost" },
      { label: "Calendar", path: "/calendar" },
      { label: "Photos", path: "/google/photos" },
    ],
  },
  {
    label: "Promote",
    path: "/promote",
    icon: "▶",
    subs: [
      { label: "Campaigns", path: "/campaigns" },
    ],
  },
  {
    label: "Engage",
    path: "/engage",
    icon: "✦",
    subs: [
      { label: "Inbox", path: "/inbox" },
      { label: "Reviews", path: "/google/reviews" },
      { label: "Spotlight", path: "/spotlight" },
    ],
  },
  {
    label: "Quantify",
    path: "/quantify",
    icon: "▥",
    subs: [
      { label: "Analytics", path: "/analytics" },
      { label: "SEO", path: "/seo" },
      { label: "GBP Performance", path: "/google/performance" },
    ],
  },
];

const ACCOUNT_NAV = [
  { label: "My Account", path: "/account", icon: "◯" },
  { label: "Team", path: "/account/team", icon: "◱" },
  { label: "Subscription", path: "/account/subscription", icon: "◈" },
];

const MANAGER_SUB_PATHS = new Set([
  "/brand", "/calendar", "/inbox", "/blog", "/entities", "/media", "/capture",
  "/account",
]);

interface SidebarProps {
  userName: string;
  sites: SiteInfo[];
  activeSiteId: string | null;
  role?: string;
}

export function Sidebar({ userName, sites, activeSiteId, role = "owner" }: SidebarProps) {
  const pathname = usePathname();
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const isSubdomain =
    typeof window !== "undefined" &&
    window.location.hostname === "studio.tracpost.com";
  const prefix = isSubdomain ? "" : "/dashboard";
  const isManager = role === "manager";

  function isModuleActive(mod: Module): boolean {
    const hubPath = prefix + mod.path;
    if (pathname === hubPath || pathname === hubPath + "/") return true;
    return mod.subs.some((sub) => {
      const full = prefix + sub.path;
      return pathname === full || pathname === full + "/" || pathname.startsWith(full + "/");
    });
  }

  function isSubActive(subPath: string): boolean {
    const full = prefix + subPath;
    return pathname === full || pathname === full + "/" || pathname.startsWith(full + "/");
  }

  function filteredSubs(mod: Module): SubItem[] {
    if (!isManager) return mod.subs;
    return mod.subs.filter((s) => MANAGER_SUB_PATHS.has(s.path));
  }

  return (
    <aside className="flex h-full w-48 flex-col border-r border-border bg-surface overflow-y-auto">
      <nav className="flex flex-1 flex-col px-2 py-3">
        {activeSiteId ? (
          <>
            {/* Dashboard home */}
            <Link
              href={prefix || "/"}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 mb-2 transition-colors ${
                pathname === prefix || pathname === prefix + "/"
                  ? "bg-accent-muted text-accent"
                  : "text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              <span className="text-xs">◆</span>
              Dashboard
            </Link>

            {/* Module links */}
            <div className="flex flex-col gap-0.5">
              {MODULES.map((mod) => {
                const subs = filteredSubs(mod);
                if (subs.length === 0 && isManager) return null;

                const active = isModuleActive(mod);
                const hovered = hoveredModule === mod.label;

                return (
                  <div
                    key={mod.label}
                    className="relative"
                    onMouseEnter={(e) => {
                      if (!active) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setFlyoutPos({ top: rect.top, left: rect.right + 4 });
                        setHoveredModule(mod.label);
                      }
                    }}
                    onMouseLeave={() => setHoveredModule(null)}
                  >
                    {/* Module link */}
                    <Link
                      href={prefix + mod.path}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                        active
                          ? "bg-accent-muted text-accent"
                          : "text-muted hover:bg-surface-hover hover:text-foreground"
                      }`}
                    >
                      <span className="text-xs">{mod.icon}</span>
                      {mod.label}
                    </Link>

                    {/* Flyout on hover (when NOT active) */}
                    {hovered && !active && subs.length > 0 && (
                      <div
                        className="fixed z-50 w-44 rounded-lg border border-border bg-surface shadow-lg py-1"
                        style={{ top: flyoutPos.top, left: flyoutPos.left }}
                        onMouseEnter={() => setHoveredModule(mod.label)}
                        onMouseLeave={() => setHoveredModule(null)}
                      >
                        {subs.map((sub) => (
                          <Link
                            key={sub.path}
                            href={prefix + sub.path}
                            className="block px-3 py-1.5 text-xs text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
                          >
                            {sub.label}
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* Expanded sub-links (when active) */}
                    {active && subs.length > 0 && (
                      <div className="ml-5 flex flex-col gap-0.5 py-0.5 border-l border-border/50">
                        {subs.map((sub) => {
                          const subActive = isSubActive(sub.path);
                          return (
                            <Link
                              key={sub.path}
                              href={prefix + sub.path}
                              className={`rounded-md px-3 py-1 text-xs transition-colors ${
                                subActive
                                  ? "text-accent font-medium"
                                  : "text-muted hover:text-foreground"
                              }`}
                            >
                              {sub.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mx-3 my-3 border-t border-border" />
          </>
        ) : (
          <div className="mb-2 px-3 py-2">
            <p className="text-[10px] text-muted">Select a site to access content tools</p>
          </div>
        )}

        {/* Account nav */}
        <div className="flex flex-col gap-0.5">
          {(isManager ? ACCOUNT_NAV.filter(i => i.path === "/account") : ACCOUNT_NAV).map((item) => {
            const href = prefix + item.path;
            const active = pathname === href || pathname === href + "/";
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors ${
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
