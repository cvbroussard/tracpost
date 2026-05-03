"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

interface SiteInfo {
  id: string;
  name: string;
  url: string;
}

interface SubItem {
  label: string;
  path: string;
  children?: { label: string; path: string }[];
}

interface Module {
  label: string;
  icon: React.ReactNode;
  subs: SubItem[];
  enterpriseOnly?: boolean;
}

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  configure: <Icon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />,
  publish: <Icon d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />,
  promote: <Icon d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />,
  engage: <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
  quantify: <Icon d="M18 20V10M12 20V4M6 20v-6" />,
};

const MODULES: Module[] = [
  {
    label: "Configure",
    icon: ICONS.configure,
    subs: [
      {
        label: "Connections",
        path: "/accounts",
        children: [
          { label: "Facebook", path: "/accounts/facebook" },
          { label: "Instagram", path: "/accounts/instagram" },
          { label: "Google Business", path: "/accounts/google-business" },
          { label: "YouTube", path: "/accounts/youtube" },
          { label: "TikTok", path: "/accounts/tiktok" },
          { label: "LinkedIn", path: "/accounts/linkedin" },
          { label: "X (Twitter)", path: "/accounts/x-twitter" },
          { label: "Pinterest", path: "/accounts/pinterest" },
        ],
      },
      { label: "Google Profile", path: "/google/profile" },
      { label: "Entities", path: "/entities" },
      { label: "Settings", path: "/settings" },
    ],
  },
  {
    label: "Publish",
    icon: ICONS.publish,
    subs: [
      { label: "Capture", path: "/capture" },
      { label: "Media", path: "/media" },
      { label: "Blog", path: "/blog" },
      { label: "Unipost", path: "/unipost" },
      { label: "GBP Photos", path: "/google/photos" },
      { label: "Calendar", path: "/calendar" },
    ],
  },
  {
    label: "Promote",
    icon: ICONS.promote,
    enterpriseOnly: true,
    subs: [
      { label: "Meta Ads", path: "/campaigns" },
    ],
  },
  {
    label: "Engage",
    icon: ICONS.engage,
    subs: [
      { label: "Inbox", path: "/inbox" },
      { label: "Reviews", path: "/google/reviews" },
      { label: "Spotlight", path: "/spotlight" },
    ],
  },
  {
    label: "Quantify",
    icon: ICONS.quantify,
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

const OWNER_ONLY_ACCOUNT_PATHS = new Set([
  "/account/subscription",
]);

interface SidebarProps {
  userName: string;
  sites: SiteInfo[];
  activeSiteId: string | null;
  role?: string;
  plan?: string;
}

export function Sidebar({ userName, sites, activeSiteId, role = "owner", plan = "" }: SidebarProps) {
  const pathname = usePathname();
  const isSubdomain =
    typeof window !== "undefined" &&
    window.location.hostname === "studio.tracpost.com";
  const prefix = isSubdomain ? "" : "/dashboard";
  const isOwner = role === "owner";
  const isEnterprise = plan.toLowerCase().includes("enterprise");
  const visibleModules = MODULES.filter((m) => !m.enterpriseOnly || isEnterprise);

  function isSubActive(subPath: string): boolean {
    const full = prefix + subPath;
    return pathname === full || pathname === full + "/" || pathname.startsWith(full + "/");
  }

  function moduleContainsActive(mod: Module): boolean {
    return mod.subs.some((sub) => isSubActive(sub.path));
  }

  // Single-expand — only one module open at a time
  const [expanded, setExpanded] = useState<string | null>(() => {
    for (const mod of visibleModules) {
      if (moduleContainsActive(mod)) return mod.label;
    }
    return null;
  });

  useEffect(() => {
    for (const mod of visibleModules) {
      if (moduleContainsActive(mod)) {
        setExpanded(mod.label);
        return;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggleModule(label: string) {
    setExpanded((prev) => prev === label ? null : label);
  }

  return (
    <aside className="flex h-full w-52 flex-col border-r border-border bg-surface overflow-y-auto">
      <nav className="flex flex-1 flex-col px-3 py-4">
        {activeSiteId ? (
          <>
            {/* Dashboard home */}
            <Link
              href={prefix || "/"}
              onClick={() => setExpanded(null)}
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
              {visibleModules.map((mod) => {
                const subs = mod.subs;
                const isExpanded = expanded === mod.label;
                const containsActive = moduleContainsActive(mod);

                return (
                  <div key={mod.label} className={isExpanded ? "bg-surface-hover rounded-lg -mx-1 px-1" : ""}>
                    {isExpanded && <div className="my-1 border-t border-border" />}
                    {/* Module toggle */}
                    <button
                      onClick={() => toggleModule(mod.label)}
                      className={`flex w-full items-center gap-2.5 rounded px-2.5 py-[7px] text-[13px] transition-colors ${
                        containsActive
                          ? "text-foreground font-medium"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      <span className={`shrink-0 w-4 ${containsActive ? "opacity-100" : "opacity-40"}`}>{mod.icon}</span>
                      <span className="flex-1 text-left">{mod.label}</span>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className={`shrink-0 opacity-40 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                      >
                        <path d="M6 3l5 5-5 5V3z"/>
                      </svg>
                    </button>

                    {/* Sub-links */}
                    {isExpanded && (
                      <div className="ml-[22px] flex flex-col gap-px py-px border-l border-border/40">
                        {subs.map((sub) => {
                          const subActive = isSubActive(sub.path);
                          return (
                            <div key={sub.path}>
                              <Link
                                href={prefix + sub.path}
                                className={`block rounded px-2.5 py-[5px] text-[13px] transition-colors ${
                                  subActive
                                    ? "text-foreground font-medium"
                                    : "text-muted hover:text-foreground"
                                }`}
                              >
                                {sub.label}
                              </Link>
                              {sub.children && subActive && (
                                <div className="ml-3 flex flex-col gap-px border-l border-border/30">
                                  {sub.children.map((child) => {
                                    const childActive = pathname === prefix + child.path || pathname === prefix + child.path + "/";
                                    return (
                                      <Link
                                        key={child.path}
                                        href={prefix + child.path}
                                        className={`rounded px-2.5 py-[4px] text-[12px] transition-colors ${
                                          childActive
                                            ? "text-foreground font-medium"
                                            : "text-muted hover:text-foreground"
                                        }`}
                                      >
                                        {child.label}
                                      </Link>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {isExpanded && <div className="my-1 border-t border-border" />}
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
          {(isOwner ? ACCOUNT_NAV : ACCOUNT_NAV.filter(i => !OWNER_ONLY_ACCOUNT_PATHS.has(i.path))).map((item) => {
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
