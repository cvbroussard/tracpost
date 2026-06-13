"use client";

/**
 * Superseded by Studio › Analysis (/ops/studio/analysis).
 * Route kept (unlinked) pending the batch route cleanup.
 */
import { ManagePage } from "@/components/manage/manage-page";
import { AssetLibraryMonitor } from "@/components/manage/asset-library-monitor";

export default function Page() {
  return (
    <ManagePage title="Media" requireSite>
      {({ siteId }) => <AssetLibraryMonitor key={siteId} siteId={siteId} />}
    </ManagePage>
  );
}
