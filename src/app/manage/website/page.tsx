"use client";

import { useState, useEffect } from "react";
import { toast } from "@/components/feedback";
import { ManagePage } from "@/components/manage/manage-page";
import {
  PageLayoutEditor,
  WorkContentEditor,
  RegenerateCopyButton,
  RegenerateServicesButton,
} from "@/app/admin/sites/[siteId]/website-pane";
import type { PageConfig, WorkContent } from "@/lib/tenant-site";

interface WebsiteData {
  site: {
    page_config: PageConfig | null;
    work_content: Record<string, unknown> | null;
    business_type: string | null;
    has_website_copy: boolean;
    custom_domain: string | null;
  };
}

function WebsiteContent({ siteId }: { siteId: string }) {
  const [data, setData] = useState<WebsiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [domainInput, setDomainInput] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [customDomain, setCustomDomain] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [domainStatus, setDomainStatus] = useState<string>("unknown");

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/manage/site?site_id=${siteId}&view=website`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setData(d);
        setCustomDomain(d?.site?.custom_domain || null);
      })
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!data) return <p className="p-6 text-xs text-muted">Failed to load website data.</p>;

  const pageConfig = (data.site.page_config || []) as PageConfig;
  const workContent = (data.site.work_content || {}) as WorkContent;
  const workVariant = pageConfig.find(s => s.key === "work")?.variant || "services_tiles";

  return (
    <div className="p-4 grid grid-cols-2 gap-4">
      {/* Left column */}
      <div className="space-y-4">
        {/* Custom domain */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Custom Domain</h3>
          <p className="text-[10px] text-muted mb-3">
            Tenant&apos;s root domain. TracPost serves everything from this domain.
          </p>
          {customDomain ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono">{customDomain}</span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
                  domainStatus === "active" ? "bg-success/20 text-success" : "bg-warning/20 text-warning"
                }`}>
                  {domainStatus === "active" ? "Active" : "Pending"}
                </span>
                <a href={`https://${customDomain}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent hover:underline">Open</a>
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
                    const d = await res.json();
                    setDomainStatus(d.root?.verified && d.root?.configured ? "active" : "pending");
                  } catch { /* ignore */ }
                  setVerifying(false);
                }}
                disabled={verifying}
                className="bg-surface-hover px-3 py-1 text-[10px] font-medium rounded hover:bg-accent hover:text-white disabled:opacity-50"
              >
                {verifying ? "Checking..." : "Verify DNS"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={domainInput}
                onChange={e => setDomainInput(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ""))}
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
                    const d = await res.json();
                    if (d.success) setCustomDomain(d.customDomain);
                    else toast.error(d.error || "Failed");
                  } catch { toast.error("Failed"); }
                  setProvisioning(false);
                }}
                disabled={provisioning || !domainInput}
                className="bg-accent px-3 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
              >
                {provisioning ? "..." : "Provision"}
              </button>
            </div>
          )}
        </div>

        {/* Work page content */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Work Page Content</h3>
          <p className="text-[10px] text-muted mb-3">
            Override auto-derived services with custom tiles or pricing tiers.
          </p>
          <WorkContentEditor
            siteId={siteId}
            activeVariant={workVariant}
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

        {/* Generated copy */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Generated Copy</h3>
          <p className="text-[10px] text-muted mb-3">
            {data.site.has_website_copy
              ? "Website copy is populated. Regenerate to refresh from the current playbook."
              : "Not yet generated — pages show fallback placeholders."}
          </p>
          <RegenerateCopyButton siteId={siteId} />
        </div>

        {/* Services & categories */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Services & GBP Categories</h3>
          <p className="text-[10px] text-muted mb-3">
            Primary + additional GBP categories and 6-8 service tiles for local SEO. Re-derive after playbook changes.
          </p>
          <RegenerateServicesButton siteId={siteId} />
        </div>
      </div>
    </div>
  );
}

export default function ManageWebsitePage() {
  return (
    <ManagePage title="Website" requireSite>
      {({ siteId }) => <WebsiteContent siteId={siteId} />}
    </ManagePage>
  );
}
