"use client";
import { ManagePage } from "@/components/manage/manage-page";
export default function Page() {
  return (
    <ManagePage title="Unipost" requireSite>
      {({ siteId }) => (
        <div className="p-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium">Unipost</h3>
            <p className="text-[10px] text-muted mt-1">Unipost management — wiring in progress.</p>
          </div>
        </div>
      )}
    </ManagePage>
  );
}
