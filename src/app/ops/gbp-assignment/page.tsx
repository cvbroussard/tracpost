"use client";
import { ManagePage } from "@/components/manage/manage-page";
export default function Page() {
  return (
    <ManagePage title="Gbp Assignment">
      {({ subscriberId }) => (
        <div className="p-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium">Gbp Assignment</h3>
            <p className="text-[10px] text-muted mt-1">Gbp Assignment management — wiring in progress.</p>
          </div>
        </div>
      )}
    </ManagePage>
  );
}
