"use client";

import { ManagePage } from "@/components/manage/manage-page";

// Infrastructure Pipeline view — stub.
//
// Per the 2026-06-12 three-milestone architecture: the Infrastructure
// milestone collects the helper requirements downstream consumers need
// (subscription, integrations, GBP, search console, website, domain,
// etc.). Each detail surface already exists and is reachable from this
// milestone's nav group; the aggregator view that summarizes their
// status (the actual "pipeline" dashboard, analogous to the Branding
// Pipeline at /ops/branding) is not yet built.
//
// When built, this page will mirror the Branding Pipeline's shape:
//   - At-a-glance dashboard of per-requirement status
//   - Drawer details on click
//   - Operator actions where they don't conflict with tenant write
//     authority (per the role-split doctrine)
//
// For now, the page serves as the milestone's URL anchor + nav target.
export default function Page() {
  return (
    <ManagePage title="Infrastructure Pipeline">
      {() => (
        <div className="p-6">
          <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center shadow-card">
            <h2 className="text-sm font-medium mb-2">Infrastructure Pipeline</h2>
            <p className="text-xs text-muted leading-relaxed max-w-md mx-auto">
              The aggregator view for the helper requirements (subscription,
              integrations, GBP, search console, website, domain) is not yet
              built. Each detail surface is reachable from the nav group on
              the left.
            </p>
          </div>
        </div>
      )}
    </ManagePage>
  );
}
