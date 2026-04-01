"use client";

import { useState, useRef, useEffect } from "react";

interface SiteInfo {
  id: string;
  name: string;
  url: string;
}

interface SidebarBrandProps {
  subscriberName: string;
  sites: SiteInfo[];
  activeSiteId: string | null;
  onSiteChange?: (siteId: string) => void;
}

export function SidebarBrand({ subscriberName, sites, activeSiteId, onSiteChange }: SidebarBrandProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeSite = sites.find((s) => s.id === activeSiteId) || sites[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="border-b border-border px-4 py-3">
      {/* Channel (site) badge / picker */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => sites.length > 1 && setOpen(!open)}
          className={`flex items-center gap-2 text-sm font-medium text-foreground transition-colors ${sites.length > 1 ? "hover:text-accent" : ""}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <span>{activeSite?.name || "No site"}</span>
          {sites.length > 1 && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`ml-0.5 transition-transform ${open ? "rotate-180" : ""}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </button>

        {/* Dropdown */}
        {open && sites.length > 1 && (
          <div className="absolute left-0 top-full z-50 mt-1 w-48 border border-border bg-surface py-1">
            {sites.map((site) => (
              <button
                key={site.id}
                onClick={() => {
                  onSiteChange?.(site.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  site.id === activeSite?.id
                    ? "bg-accent-muted text-accent"
                    : "text-muted hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${site.id === activeSite?.id ? "bg-success" : "bg-dim"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{site.name}</p>
                  <p className="truncate text-[10px] text-dim">{site.url}</p>
                </div>
              </button>
            ))}
            <div className="border-t border-border mt-1 pt-1">
              <button
                onClick={() => {
                  onSiteChange?.("");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted hover:bg-surface-hover hover:text-foreground"
              >
                ← All Sites
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
