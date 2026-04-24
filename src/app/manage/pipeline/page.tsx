"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { AutopilotControls, RenderPipelineButton, RegenerateServicesButton } from "@/app/admin/sites/[siteId]/website-pane";
export default function Page() {
  return (
    <ManagePage title="Pipeline" requireSite>
      {({ siteId }) => (
        <div className="p-4 grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-1">Autopilot Publish</h3>
            <p className="text-[10px] text-muted mb-3">Trigger publish or refresh tokens.</p>
            <AutopilotControls siteId={siteId} />
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-1">Render Pipeline</h3>
            <p className="text-[10px] text-muted mb-3">Batch render pending assets.</p>
            <RenderPipelineButton siteId={siteId} />
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-1">Services & Categories</h3>
            <p className="text-[10px] text-muted mb-3">Re-derive GBP categories and services.</p>
            <RegenerateServicesButton siteId={siteId} />
          </div>
        </div>
      )}
    </ManagePage>
  );
}
