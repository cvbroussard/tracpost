"use client";

import { RenderPipelineButton, AutopilotControls, SyncReviewsButton, RegenerateServicesButton, RegenerateCopyButton } from "../website-pane";
import type { Counts } from "../site-tabs";

export function ActionsTab({ siteId, counts }: { siteId: string; counts: Counts }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Left column — publish & generate */}
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Autopilot Publish</h3>
          <p className="text-[10px] text-muted mb-3">
            Trigger the cadence-driven autopilot or refresh expired tokens.
          </p>
          <AutopilotControls siteId={siteId} />
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Render Pipeline</h3>
          <p className="text-[10px] text-muted mb-3">
            Batch render pending assets across all platforms.
          </p>
          <RenderPipelineButton siteId={siteId} />
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Regenerate Copy</h3>
          <p className="text-[10px] text-muted mb-3">
            AI-write new copy for home, about, work, contact pages.
          </p>
          <RegenerateCopyButton siteId={siteId} />
        </div>
      </div>

      {/* Right column — services & sync */}
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Services & Categories</h3>
          <p className="text-[10px] text-muted mb-3">
            Re-derive GBP categories and service tiles from the playbook.
          </p>
          <RegenerateServicesButton siteId={siteId} />
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Sync Reviews</h3>
          <p className="text-[10px] text-muted mb-3">
            Pull reviews from GBP and auto-draft AI replies.
          </p>
          <SyncReviewsButton siteId={siteId} />
        </div>
      </div>
    </div>
  );
}
