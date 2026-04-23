"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TopBar } from "@/components/topbar";
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

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Provision",
    items: [
      { label: "Onboarding", path: "/onboarding" },
      { label: "GBP Assignment", path: "/gbp-assignment" },
      { label: "Account Setup", path: "/account-setup" },
    ],
  },
  {
    label: "Configure",
    items: [
      { label: "Brand Playbook", path: "/brand" },
      { label: "Site Controls", path: "/sites" },
      { label: "Page Layout", path: "/page-layout" },
      { label: "Domain", path: "/domain" },
    ],
  },
  {
    label: "Content",
    items: [
      { label: "Pipeline", path: "/pipeline" },
      { label: "Media", path: "/media" },
      { label: "Blog", path: "/blog" },
      { label: "Corrections", path: "/corrections" },
      { label: "Quality Gates", path: "/quality" },
    ],
  },
  {
    label: "Publish",
    items: [
      { label: "Autopilot", path: "/autopilot" },
      { label: "Connections", path: "/connections" },
      { label: "Calendar", path: "/calendar" },
      { label: "Unipost", path: "/unipost" },
    ],
  },
  {
    label: "Monitor",
    items: [
      { label: "SEO", path: "/seo" },
      { label: "Analytics", path: "/analytics" },
      { label: "PageSpeed", path: "/pagespeed" },
      { label: "Search Console", path: "/search-console" },
    ],
  },
  {
    label: "Engage",
    items: [
      { label: "Reviews", path: "/reviews" },
      { label: "Inbox", path: "/inbox" },
      { label: "Spotlight", path: "/spotlight" },
    ],
  },
  {
    label: "Billing",
    items: [
      { label: "Subscription", path: "/billing" },
      { label: "Invoices", path: "/invoices" },
    ],
  },
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

  function isSubActive(navPath: string): boolean {
    const full = prefix + navPath;
    return pathname === full || pathname === full + "/" || pathname.startsWith(full + "/");
  }

  function groupContainsActive(group: NavGroup): boolean {
    return group.items.some(item => isSubActive(item.path));
  }

  // Single-expand nav groups
  const [expandedGroup, setExpandedGroup] = useState<string | null>(() => {
    for (const g of NAV_GROUPS) {
      if (groupContainsActive(g)) return g.label;
    }
    return null;
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar userName="Operator" variant="manage" />
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

          {/* Nav groups */}
          <nav className="flex flex-col gap-px px-3 pb-4">
            {NAV_GROUPS.map(group => {
              const isExpanded = expandedGroup === group.label;
              const containsActive = groupContainsActive(group);

              return (
                <div key={group.label}>
                  {isExpanded && <div className="my-1 border-t border-border" />}
                  <button
                    onClick={() => setExpandedGroup(isExpanded ? null : group.label)}
                    className={`flex w-full items-center gap-2 rounded px-2.5 py-[7px] text-[13px] transition-colors ${
                      containsActive ? "text-foreground font-medium" : "text-muted hover:text-foreground"
                    }`}
                  >
                    <span className="flex-1 text-left">{group.label}</span>
                    <svg
                      width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
                      className={`shrink-0 opacity-40 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                    >
                      <path d="M6 3l5 5-5 5V3z"/>
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className={`ml-3 flex flex-col gap-px py-px border-l border-border/40 ${isExpanded ? "bg-surface-hover rounded-lg -mx-1 px-1" : ""}`}>
                      {group.items.map(item => {
                        const active = isSubActive(item.path);
                        return (
                          <Link
                            key={item.path}
                            href={prefix + item.path}
                            className={`rounded px-2.5 py-[5px] text-[13px] transition-colors ${
                              active ? "text-foreground font-medium" : "text-muted hover:text-foreground"
                            }`}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                  {isExpanded && <div className="my-1 border-t border-border" />}
                </div>
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
