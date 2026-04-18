import { EmptyState } from "@/components/empty-state";

export default function ProfilePage() {
  return (
    <div className="p-6">
      <EmptyState
        icon="◇"
        title="Profile"
        description="Manage your Google Business Profile — hours, description, categories, and attributes. Coming soon."
      />
    </div>
  );
}
