"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

interface Site {
  id: string;
  name: string;
  url: string;
  is_active?: boolean;
}

interface PageHeaderProps {
  siteName: string;
  siteIcon?: string;
  sites: Site[];
  activeSiteId: string | null;
  children?: React.ReactNode;
}

const PAGE_TITLES: Record<string, string> = {
  "": "Dashboard",
  "/brand": "Brand",
  "/capture": "Capture",
  "/media": "Media",
  "/blog": "Blog",
  "/calendar": "Calendar",
  "/inbox": "Inbox",
  "/seo": "SEO",
  "/spotlight": "Spotlight",
  "/analytics": "Analytics",
  "/accounts": "Connections",
  "/account": "My Account",
  "/entities": "Entities",
  "/project-preview": "Project Preview",
  "/account/vendors": "Vendors",
  "/account/mobile-app": "Team",
  "/account/team": "Team",
  "/account/subscription": "Subscription",
  "/settings": "Settings",
};

export function PageHeader({ siteName, sites, activeSiteId, children }: PageHeaderProps) {
  const pathname = usePathname();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    if (pickerOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pickerOpen]);

  const prefix = "/dashboard";
  const relative = pathname.replace(prefix, "") || "";

  // Build page breadcrumb from path
  const segments = relative.split("/").filter(Boolean);
  const crumbs: Array<{ label: string; href: string }> = [];

  let accumulated = prefix;
  for (const seg of segments) {
    accumulated += `/${seg}`;
    const fullRelative = accumulated.replace(prefix, "");
    const label = PAGE_TITLES[fullRelative] || seg.charAt(0).toUpperCase() + seg.slice(1);
    crumbs.push({ label, href: accumulated });
  }

  const currentPage = crumbs.length > 0 ? crumbs.pop()! : null;

  async function switchSite(siteId: string | null) {
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeSiteId: siteId }),
    });
    window.location.href = "/dashboard";
  }

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-5 py-2.5">
      <div className="flex items-center gap-1.5 text-sm">
        {/* Dashboard = account portal */}
        <Link href={prefix} className="text-muted hover:text-foreground" onClick={(e) => {
          e.preventDefault();
          switchSite(null);
        }}>
          Dashboard
        </Link>

        {/* Site picker breadcrumb */}
        {activeSiteId && (
          <>
            <span className="text-dim">/</span>
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => setPickerOpen(!pickerOpen)}
                className="flex items-center gap-1 font-medium text-foreground hover:text-accent"
              >
                {siteName}
                {sites.length > 0 && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${pickerOpen ? "rotate-180" : ""}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                )}
              </button>

              {pickerOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded border border-border bg-surface py-1 shadow-lg">
                  {sites.map((site) => (
                    <button
                      key={site.id}
                      onClick={() => {
                        switchSite(site.id);
                        setPickerOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                        site.id === activeSiteId
                          ? "bg-accent-muted text-accent"
                          : site.is_active === false
                          ? "text-muted/50 hover:bg-surface-hover"
                          : "text-muted hover:bg-surface-hover hover:text-foreground"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        site.id === activeSiteId ? "bg-success"
                          : site.is_active === false ? "bg-muted/30"
                          : "bg-dim"
                      }`} />
                      <div>
                        <p className={`font-medium ${site.is_active === false ? "opacity-50" : ""}`}>{site.name}</p>
                        {site.url && <p className="text-[10px] text-dim">{site.url}</p>}
                      </div>
                      {site.is_active === false && (
                        <span className="ml-auto text-[9px] text-muted/50">inactive</span>
                      )}
                    </button>
                  ))}
                  <div className="border-t border-border mt-1 pt-1">
                    <button
                      onClick={() => switchSite(null)}
                      className="flex w-full items-center px-3 py-2 text-left text-xs text-muted hover:bg-surface-hover hover:text-foreground"
                    >
                      + Add Site
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Page breadcrumbs */}
        {crumbs.map((crumb) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            <span className="text-dim">/</span>
            <Link href={crumb.href} className="text-muted hover:text-foreground">
              {crumb.label}
            </Link>
          </span>
        ))}
        {currentPage && (
          <>
            <span className="text-dim">/</span>
            <span className="text-muted">{currentPage.label}</span>
          </>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-3">
          {children}
        </div>
      )}
    </div>
  );
}
