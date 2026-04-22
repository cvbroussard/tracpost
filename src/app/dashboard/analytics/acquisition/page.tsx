import { EmptyState } from "@/components/empty-state";

export default function Page() {
  return (
    <div className="p-6">
      <EmptyState
        icon="▥"
        title="Coming soon"
        description="This analytics view is being built."
      />
    </div>
  );
}
