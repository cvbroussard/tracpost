"use client";

/**
 * Superseded by Media Production › Analysis (/manage/media-production/analysis).
 * Route kept (unlinked from the Monitor nav) pending the batch route cleanup.
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
