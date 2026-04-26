"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { TopBar } from "@/components/topbar";
import { ManageProvider } from "./manage-context";
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
    label: "Site Settings",
    items: [
      { label: "Brand Playbook", path: "/brand" },
      { label: "Copy Generation", path: "/copy-gen" },
      { label: "Media Generation", path: "/media-gen" },
      { label: "Blog", path: "/blog-config" },
      { label: "Social", path: "/social-config" },
      { label: "Connections", path: "/connections" },
      { label: "GBP", path: "/gbp" },
      { label: "Website", path: "/website" },
    ],
  },
  {
    label: "Monitor",
    items: [
      { label: "Media", path: "/media" },
      { label: "Blog", path: "/blog" },
      { label: "SEO", path: "/seo" },
      { label: "Analytics", path: "/analytics" },
      { label: "Review Advisor", path: "/review-advisor" },
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
  const router = useRouter();
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
    if (id === "all") { setExpandedGroup(null); router.push(prefix || "/"); }
  }

  // Set subscriber when site is selected
  function handleSiteChange(siteId: string) {
    setSelectedSiteId(siteId);
    if (siteId === "all") {
      setExpandedGroup(null);
      router.push(prefix || "/");
    } else {
      const site = sites.find(s => s.id === siteId);
      if (site) setSelectedSubscriberId(site.subscriptionId);
    }
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
            <div>
              <select
                value={selectedSubscriberId}
                onChange={e => handleSubscriberChange(e.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-[13px] focus:border-accent focus:outline-none"
              >
                <option value="all">All subscribers ({subscribers.length})</option>
                {filteredSubscribers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedSiteId}
                onChange={e => handleSiteChange(e.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-[13px] focus:border-accent focus:outline-none"
              >
                <option value="all">All sites ({filteredSites.length})</option>
                {filteredSites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

          </div>

          <div className="mx-3 my-2 border-t border-border" />

          {/* Nav */}
          <nav className="flex flex-col gap-px px-3 pb-4">
            <Link
              href={prefix || "/"}
              onClick={() => setExpandedGroup(null)}
              className={`rounded px-2.5 py-[7px] text-[13px] transition-colors mb-1 ${
                pathname === prefix || pathname === prefix + "/" || pathname === "/"
                  ? "text-foreground font-medium bg-surface-hover"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Overview
            </Link>
            <Link
              href={`${prefix}/provisioning`}
              onClick={() => setExpandedGroup(null)}
              className={`rounded px-2.5 py-[7px] text-[13px] transition-colors mb-1 ${
                pathname.startsWith(`${prefix}/provisioning`) || (prefix === "" && pathname.startsWith("/provisioning"))
                  ? "text-foreground font-medium bg-surface-hover"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Provision Pipeline
            </Link>
            <Link
              href={`${prefix}/site-actions`}
              onClick={() => setExpandedGroup(null)}
              className={`rounded px-2.5 py-[7px] text-[13px] transition-colors mb-1 ${
                pathname.startsWith(`${prefix}/site-actions`) || (prefix === "" && pathname.startsWith("/site-actions"))
                  ? "text-foreground font-medium bg-surface-hover"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Site Actions
            </Link>
            {NAV_GROUPS.map(group => {
              const isExpanded = expandedGroup === group.label;
              const containsActive = groupContainsActive(group);
              const disabled = selectedSubscriberId === "all";

              return (
                <div key={group.label} className={disabled ? "opacity-30 pointer-events-none" : ""}>
                  {isExpanded && <div className="my-1 border-t border-border" />}
                  <button
                    onClick={() => setExpandedGroup(isExpanded ? null : group.label)}
                    disabled={disabled}
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
          {/* Context header */}
          <div className="flex items-center gap-3 border-b border-border px-5 py-3">
            {selectedSubscriber ? (
              <>
                <h1 className="text-sm font-semibold">{selectedSubscriber.name}</h1>
                {selectedSite && selectedSiteId !== "all" && (
                  <>
                    <span className="text-xs text-muted">/</span>
                    <span className="text-sm">{selectedSite.name}</span>
                  </>
                )}
                <span className="rounded bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                  {selectedSubscriber.plan}
                </span>
              </>
            ) : (
              <>
                <h1 className="text-sm font-semibold">All Subscribers</h1>
                <span className="text-xs text-muted">{subscribers.length} subscribers · {sites.length} sites</span>
              </>
            )}
          </div>
          <ManageProvider value={{
            subscriberId: selectedSubscriberId,
            siteId: selectedSiteId,
            subscriberName: selectedSubscriber?.name || null,
            siteName: selectedSite?.name || null,
            plan: selectedSubscriber?.plan || null,
          }}>
            {children}
          </ManageProvider>
        </main>
      </div>
    </div>
  );
}
