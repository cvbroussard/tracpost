import { EmptyState } from "@/components/empty-state";

export default function PerformancePage() {
  return (
    <div className="p-6">
      <EmptyState
        icon="▥"
        title="Performance"
        description="GBP search impressions, map views, calls, direction requests, and Search Console data. Coming soon."
      />
    </div>
  );
}
