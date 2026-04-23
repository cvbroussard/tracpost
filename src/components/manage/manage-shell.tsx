"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertRibbon } from "./alert-ribbon";

interface Subscriber {
  id: string;
  name: string;
  plan: string;
  siteCount: number;
}

interface Site {
  id: string;
  name: string;
  subscriptionId: string;
  customDomain: string | null;
}

interface NavItem {
  label: string;
  path: string;
}

const NAV: NavItem[] = [
  { label: "Overview", path: "" },
  { label: "Site Controls", path: "/sites" },
  { label: "Connections", path: "/connections" },
  { label: "Content", path: "/content" },
  { label: "Pipeline", path: "/pipeline" },
  { label: "SEO", path: "/seo" },
  { label: "Provisioning", path: "/provisioning" },
  { label: "Billing", path: "/billing" },
];

export function ManageShell({
  subscribers,
  sites,
  children,
}: {
  subscribers: Subscriber[];
  sites: Site[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [selectedSubscriberId, setSelectedSubscriberId] = useState<string>("all");
  const [selectedSiteId, setSelectedSiteId] = useState<string>("all");
  const [subscriberSearch, setSubscriberSearch] = useState("");

  const prefix = pathname.startsWith("/manage") ? "/manage" : "";

  // Filter sites by selected subscriber
  const filteredSites = useMemo(() => {
    if (selectedSubscriberId === "all") return sites;
    return sites.filter(s => s.subscriptionId === selectedSubscriberId);
  }, [selectedSubscriberId, sites]);

  // Filter subscriber list by search
  const filteredSubscribers = useMemo(() => {
    if (!subscriberSearch) return subscribers;
    const q = subscriberSearch.toLowerCase();
    return subscribers.filter(s => s.name.toLowerCase().includes(q));
  }, [subscriberSearch, subscribers]);

  // Reset site when subscriber changes
  function handleSubscriberChange(id: string) {
    setSelectedSubscriberId(id);
    setSelectedSiteId("all");
    setSubscriberSearch("");
  }

  const selectedSubscriber = subscribers.find(s => s.id === selectedSubscriberId);
  const selectedSite = sites.find(s => s.id === selectedSiteId);

  function isActive(navPath: string): boolean {
    const full = prefix + navPath;
    if (navPath === "") return pathname === prefix || pathname === prefix + "/";
    return pathname.startsWith(full);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Ribbon — full width, persistent */}
      <AlertRibbon />

      <div className="flex flex-1 overflow-hidden">
        {/* Left nav with context pickers */}
        <aside className="flex h-full w-56 flex-col border-r border-border bg-surface overflow-y-auto">
          <div className="px-3 pt-4 pb-2 space-y-2">
            {/* Subscriber picker */}
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-muted mb-1 px-1">Subscriber</label>
              <select
                value={selectedSubscriberId}
                onChange={e => handleSubscriberChange(e.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-[13px] focus:border-accent focus:outline-none"
              >
                <option value="all">All subscribers ({subscribers.length})</option>
                {filteredSubscribers.map(s => (
                  <option key={s.id} value={s.id}>{s.name} · {s.plan}</option>
                ))}
              </select>
            </div>

            {/* Site picker */}
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-muted mb-1 px-1">Site</label>
              <select
                value={selectedSiteId}
                onChange={e => setSelectedSiteId(e.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-[13px] focus:border-accent focus:outline-none"
              >
                <option value="all">All sites ({filteredSites.length})</option>
                {filteredSites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.customDomain ? ` · ${s.customDomain}` : ""}</option>
                ))}
              </select>
            </div>

            {/* Quick stats */}
            {selectedSubscriber && (
              <div className="rounded bg-surface-hover px-2.5 py-2 text-[11px]">
                <p className="font-medium">{selectedSubscriber.name}</p>
                <p className="text-muted">{selectedSubscriber.plan} · {selectedSubscriber.siteCount} site{selectedSubscriber.siteCount !== 1 ? "s" : ""}</p>
              </div>
            )}
          </div>

          <div className="mx-3 my-2 border-t border-border" />

          {/* Nav links */}
          <nav className="flex flex-col gap-px px-3 pb-4">
            {NAV.map(item => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  href={prefix + item.path}
                  className={`rounded px-2.5 py-[7px] text-[13px] transition-colors ${
                    active
                      ? "text-foreground font-medium bg-surface-hover"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
