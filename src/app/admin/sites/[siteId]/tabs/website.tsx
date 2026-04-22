"use client";

import { useState } from "react";
import type { PageConfig, WorkContent } from "@/lib/tenant-site";
import {
  PageLayoutEditor,
  HeroOverridePicker,
  WorkContentEditor,
} from "../website-pane";
import type { SiteData, DomainInfo, HeroAsset } from "../site-tabs";

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  purpose: string;
}

export function WebsiteTab({
  siteId,
  site,
  domainInfo,
  pageConfig,
  hasWebsiteCopy,
  workContent,
}: {
  siteId: string;
  site: SiteData;
  domainInfo: DomainInfo | null;
  pageConfig: PageConfig;
  hasWebsiteCopy: boolean;
  workContent: WorkContent;
  heroAssetCandidates: HeroAsset[];
  currentHeroAssetId: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Left column */}
      <div className="space-y-4">
        {/* Custom domain */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Custom Domain</h3>
          <p className="text-[10px] text-muted mb-3">
            Tenant's root domain. TracPost serves everything from this domain.
          </p>
          <DomainCard siteId={siteId} customDomain={site.customDomain || ""} initialDomainInfo={domainInfo} />
        </div>

        {/* Work page content */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Work Page Content</h3>
          <p className="text-[10px] text-muted mb-3">
            Override auto-derived services with custom tiles or pricing tiers.
          </p>
          <WorkContentEditor
            siteId={siteId}
            activeVariant={pageConfig.find((s) => s.key === "work")?.variant || "services_tiles"}
            initial={workContent}
          />
        </div>
      </div>

      {/* Right column */}
      <div className="space-y-4">
        {/* Page layout */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Page Layout</h3>
          <p className="text-[10px] text-muted mb-3">
            Six-slot page model. Disable slots, rename labels, pick content variants.
          </p>
          <PageLayoutEditor siteId={siteId} initial={pageConfig} />
        </div>
      </div>
    </div>
  );
}

function DomainCard({
  siteId,
  customDomain: initialDomain,
  initialDomainInfo,
}: {
  siteId: string;
  customDomain: string;
  initialDomainInfo: DomainInfo | null;
}) {
  const [domainInput, setDomainInput] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [customDomain, setCustomDomain] = useState(initialDomain);
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[] | null>(initialDomainInfo?.dnsRecords || null);
  const [status, setStatus] = useState(initialDomainInfo?.status || "unknown");
  const [wwwStatus, setWwwStatus] = useState(initialDomainInfo?.wwwStatus || "unknown");
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const wwwDomain = customDomain ? `www.${customDomain}` : "";

  function statusBadge(s: string) {
    if (s === "active") return <span className="rounded-full bg-success/20 px-2 py-0.5 text-[9px] font-medium text-success">Active</span>;
    if (s === "pending") return <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[9px] font-medium text-warning">Pending DNS</span>;
    return <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[9px] font-medium text-muted">Unverified</span>;
  }

  if (!customDomain) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={domainInput}
          onChange={(e) => setDomainInput(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ""))}
          className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
          placeholder="b2construct.com"
        />
        <button
          onClick={async () => {
            if (!domainInput) return;
            setProvisioning(true);
            try {
              const res = await fetch("/api/blog/domain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "provision", site_id: siteId, domain: domainInput }),
              });
              const data = await res.json();
              if (data.success) {
                setCustomDomain(data.customDomain);
                setDnsRecords(data.dnsRecords);
                setStatus(data.status === "active" ? "active" : "pending");
              } else {
                alert(data.error || "Provisioning failed");
              }
            } catch { alert("Failed"); }
            setProvisioning(false);
          }}
          disabled={provisioning || !domainInput}
          className="bg-accent px-3 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
        >
          {provisioning ? "..." : "Provision"}
        </button>
      </div>
    );
  }

  const records = dnsRecords || [
    { type: "A", name: "@", value: "76.76.21.21", purpose: "Root → Vercel" },
    { type: "CNAME", name: "www", value: "cname.vercel-dns.com", purpose: "www → Vercel" },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded border border-border bg-background">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono">{customDomain}</span>
            {statusBadge(status)}
          </div>
          <a href={`https://${customDomain}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent hover:underline">Open</a>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono">{wwwDomain}</span>
            {statusBadge(wwwStatus)}
          </div>
        </div>
      </div>

      <button
        onClick={async () => {
          setVerifying(true);
          try {
            const res = await fetch("/api/blog/domain", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "verify", site_id: siteId }),
            });
            const data = await res.json();
            setStatus(data.root?.verified && data.root?.configured ? "active" : "pending");
            setWwwStatus(data.www?.verified && data.www?.configured ? "active" : "pending");
          } catch { alert("Verification failed"); }
          setVerifying(false);
        }}
        disabled={verifying}
        className="bg-surface-hover px-3 py-1 text-[10px] font-medium rounded hover:bg-accent hover:text-white disabled:opacity-50"
      >
        {verifying ? "Checking..." : "Verify DNS"}
      </button>

      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-muted border-b border-border">
            <th className="text-left py-1 pr-2 w-12">Type</th>
            <th className="text-left py-1 pr-2">Name</th>
            <th className="text-left py-1 pr-2">Value</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-2 font-mono font-medium">{r.type}</td>
              <td className="py-1.5 pr-2 font-mono">{r.name}</td>
              <td className="py-1.5 pr-2 font-mono break-all text-muted">{r.value}</td>
              <td className="py-1.5">
                <button
                  onClick={() => { navigator.clipboard.writeText(r.value); setCopied(`r-${i}`); setTimeout(() => setCopied(null), 1500); }}
                  className="text-[9px] text-muted hover:text-accent"
                >
                  {copied === `r-${i}` ? "!" : "copy"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}