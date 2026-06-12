"use client";

import { ManagePage } from "@/components/manage/manage-page";

// Media Production Pipeline view — stub.
//
// Per the 2026-06-12 three-milestone architecture: the Media Production
// milestone is the active production cycle (capture → triage → generate
// → review → publish) that consumes brand identity (from the Branding
// milestone) and infrastructure plumbing (from the Infrastructure
// milestone). Each detail surface already exists; the aggregator that
// summarizes the production state (active jobs, queue health, recent
// outputs) is not yet built.
//
// When built, this page will mirror the Branding Pipeline's shape but
// with production-cycle semantics:
//   - In-flight production state at a glance
//   - Per-job drill-down via the drawer
//   - Operator interventions (regenerate, advise review, etc.)
//
// For now, the page serves as the milestone's URL anchor + nav target.
export default function Page() {
  return (
    <ManagePage title="Media Production Pipeline">
      {() => (
        <div className="p-6">
          <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center shadow-card">
            <h2 className="text-sm font-medium mb-2">Media Production Pipeline</h2>
            <p className="text-xs text-muted leading-relaxed max-w-md mx-auto">
              The aggregator view for in-flight production (capture, triage,
              generation, review) is not yet built. Each detail surface is
              reachable from the nav group on the left.
            </p>
          </div>
        </div>
      )}
    </ManagePage>
  );
}
