"use client";

import { ManagePage } from "@/components/manage/manage-page";
import { AssetLibraryMonitor } from "@/components/manage/asset-library-monitor";

export default function MediaProductionAnalysisPage() {
  return (
    <ManagePage title="Analysis" requireSite>
      {({ siteId }) => <AssetLibraryMonitor siteId={siteId} />}
    </ManagePage>
  );
}
