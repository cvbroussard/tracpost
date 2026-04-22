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
  { label: "My Account", path: "/account" },
  { label: "Team", path: "/account/team" },
  { label: "Subscription", path: "/account/subscription" },
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
    <aside className="flex h-full w-52 flex-col border-r border-border bg-surface overflow-y-auto">
      <nav className="flex flex-1 flex-col px-3 py-4">
        {activeSiteId ? (
          <>
            {/* Dashboard home */}
            <Link
              href={prefix || "/"}
              className={`flex items-center gap-2.5 rounded px-2.5 py-[7px] text-[13px] transition-colors ${
                pathname === prefix || pathname === prefix + "/"
                  ? "text-foreground font-medium bg-surface-hover"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="shrink-0 opacity-60">
                <path d="M8 1L1 5.5V14h5V10h4v4h5V5.5L8 1z"/>
              </svg>
              Dashboard
            </Link>

            <div className="my-2 border-t border-border" />

            {/* Module links */}
            <div className="flex flex-col gap-px">
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
                      className={`flex items-center gap-2.5 rounded px-2.5 py-[7px] text-[13px] transition-colors ${
                        active
                          ? "text-foreground font-medium bg-surface-hover"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      <span className="shrink-0 text-[11px] w-3.5 text-center opacity-60">{mod.icon}</span>
                      <span className="flex-1">{mod.label}</span>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className={`shrink-0 opacity-40 transition-transform ${active ? "rotate-90" : ""}`}
                      >
                        <path d="M6 3l5 5-5 5V3z"/>
                      </svg>
                    </Link>

                    {/* Flyout on hover (when NOT active) */}
                    {hovered && !active && subs.length > 0 && (
                      <div
                        className="fixed z-50 w-44 rounded-md border border-border bg-surface shadow-lg py-1"
                        style={{ top: flyoutPos.top, left: flyoutPos.left }}
                        onMouseEnter={() => setHoveredModule(mod.label)}
                        onMouseLeave={() => setHoveredModule(null)}
                      >
                        {subs.map((sub) => (
                          <Link
                            key={sub.path}
                            href={prefix + sub.path}
                            className="block px-3 py-[6px] text-[13px] text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
                          >
                            {sub.label}
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* Expanded sub-links (when active) */}
                    {active && subs.length > 0 && (
                      <div className="ml-[22px] flex flex-col gap-px py-px border-l border-border/40">
                        {subs.map((sub) => {
                          const subActive = isSubActive(sub.path);
                          return (
                            <Link
                              key={sub.path}
                              href={prefix + sub.path}
                              className={`rounded px-2.5 py-[5px] text-[13px] transition-colors ${
                                subActive
                                  ? "text-foreground font-medium"
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

            <div className="my-2 border-t border-border" />
          </>
        ) : (
          <div className="mb-2 px-2.5 py-2">
            <p className="text-[11px] text-muted">Select a site to access content tools</p>
          </div>
        )}

        {/* Account nav */}
        <div className="flex flex-col gap-px">
          {(isManager ? ACCOUNT_NAV.filter(i => i.path === "/account") : ACCOUNT_NAV).map((item) => {
            const href = prefix + item.path;
            const active = pathname === href || pathname === href + "/";
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center rounded px-2.5 py-[7px] text-[13px] transition-colors ${
                  active
                    ? "text-foreground font-medium bg-surface-hover"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
