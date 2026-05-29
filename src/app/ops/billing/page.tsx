"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { BillingCard } from "@/app/admin/subscribers/[id]/billing-card";
export default function Page() {
  return (
    <ManagePage title="Subscription">
      {({ subscriberId }) => <div className="p-4"><BillingCard subscriptionId={subscriberId} /></div>}
    </ManagePage>
  );
}
