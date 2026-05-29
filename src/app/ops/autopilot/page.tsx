"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { AutopilotControls } from "@/app/admin/sites/[siteId]/website-pane";
export default function Page() {
  return (
    <ManagePage title="Autopilot" requireSite>
      {({ siteId }) => (
        <div className="p-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-1">Autopilot Publishing</h3>
            <p className="text-[10px] text-muted mb-3">Publish now or refresh expired tokens.</p>
            <AutopilotControls siteId={siteId} />
          </div>
        </div>
      )}
    </ManagePage>
  );
}
