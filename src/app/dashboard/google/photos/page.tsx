import { EmptyState } from "@/components/empty-state";

export default function PhotosPage() {
  return (
    <div className="p-6">
      <EmptyState
        icon="▣"
        title="Photos"
        description="Manage your GBP photo gallery. Sync your best media assets directly to your Google listing. Coming soon."
      />
    </div>
  );
}
