"use client";

import { useState, useEffect } from "react";
import { ManagePage } from "@/components/manage/manage-page";
import { BrandPlaybookView } from "@/app/dashboard/brand/brand-playbook-view";
import { GeneratePlaybookButton } from "@/app/dashboard/brand/generate-playbook-button";

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

  if (!data.hasPlaybook && data.provisioningStatus === "requested") {
    return (
      <div className="p-6 py-16 text-center">
        <div className="mb-4 mx-auto h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <h2 className="text-sm font-medium">Generating Brand Playbook</h2>
        <p className="mt-2 text-xs text-muted">Building brand intelligence. This typically takes a few minutes.</p>
      </div>
    );
  }

  if (!data.hasPlaybook) {
    return (
      <div className="p-6">
        <GeneratePlaybookButton
          siteId={data.siteId}
          businessType={data.businessType || ""}
          location={data.location || ""}
          websiteUrl={data.url || ""}
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <BrandPlaybookView
        siteId={data.siteId}
        playbook={data.playbook}
        subscriberAngle={data.subscriberAngle}
      />
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
