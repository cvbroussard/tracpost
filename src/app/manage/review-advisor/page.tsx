"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { SyncReviewsButton } from "@/app/admin/sites/[siteId]/website-pane";

export default function Page() {
  return (
    <ManagePage title="Review Advisor" requireSite>
      {({ siteId }) => (
        <div className="p-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-1">Sync Reviews</h3>
            <p className="text-[10px] text-muted mb-3">Pull reviews from GBP and auto-draft AI replies using the subscriber&apos;s voice.</p>
            <SyncReviewsButton siteId={siteId} />
          </div>
        </div>
      )}
    </ManagePage>
  );
}
