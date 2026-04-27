"use client";

import { useState, useEffect } from "react";
import { ManagePage } from "@/components/manage/manage-page";
import { BrandPlaybookView } from "@/app/dashboard/brand/brand-playbook-view";
import { GeneratePlaybookButton } from "@/app/dashboard/brand/generate-playbook-button";
import { CompareModal } from "./compare-modal";

interface BrandData {
  siteId: string;
  siteName: string;
  url: string | null;
  businessType: string;
  location: string;
  contentVibe: string | null;
  imageStyle: string | null;
  provisioningStatus: string;
  hasPlaybook: boolean;
  playbook: Record<string, unknown>;
  subscriberAngle: string | null;
}

function BrandContent({ siteId }: { siteId: string }) {
  const [data, setData] = useState<BrandData | null>(null);
  const [loading, setLoading] = useState(true);
  const [compareOpen, setCompareOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/manage/brand?site_id=${siteId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return <p className="p-6 text-xs text-muted">Failed to load brand data.</p>;
  }

  if (!data.hasPlaybook) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card max-w-md">
          <h3 className="text-sm font-medium mb-1">No Playbook Yet</h3>
          <p className="text-[10px] text-muted mb-3">
            Generate the brand playbook to establish voice, positioning, and content direction.
          </p>
          <GeneratePlaybookButton
            siteId={data.siteId}
            businessType={data.businessType || ""}
            location={data.location || ""}
            websiteUrl={data.url || ""}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => setCompareOpen(true)}
          className="rounded border border-border px-3 py-1.5 text-[11px] font-medium text-muted hover:text-foreground hover:bg-surface-hover"
          title="Score historical signal, extract observations, generate an augmented V2 playbook, compare side-by-side"
        >
          Compare with augmented
        </button>
        <GeneratePlaybookButton
          siteId={data.siteId}
          businessType={data.businessType || ""}
          location={data.location || ""}
          websiteUrl={data.url || ""}
          compact
        />
      </div>
      <BrandPlaybookView
        siteId={data.siteId}
        playbook={data.playbook}
        subscriberAngle={data.subscriberAngle}
      />
      {compareOpen && <CompareModal siteId={data.siteId} onClose={() => setCompareOpen(false)} />}
    </div>
  );
}

export default function ManageBrandPage() {
  return (
    <ManagePage title="Brand Playbook" requireSite>
      {({ siteId }) => <BrandContent siteId={siteId} />}
    </ManagePage>
  );
}
