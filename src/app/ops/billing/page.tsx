"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { BillingCard } from "@/app/admin/accounts/[id]/billing-card";
import { AccountGovernanceSection } from "@/components/manage/account-governance-section";

// Subscription surface (Infrastructure milestone). Hosts the BillingCard
// (Stripe state, plan, charges) plus AccountGovernanceSection (suspend /
// reinstate). Previously the governance UI was wedged into the checkout
// task drawer on the branding pipeline; moved here when checkout was
// retired from branding per the 2026-06-12 three-milestone architecture.
export default function Page() {
  return (
    <ManagePage title="Subscription">
      {({ subscriberId }) => (
        <div className="p-4 space-y-4">
          <BillingCard subscriptionId={subscriberId} />
          <AccountGovernanceSection subscriptionId={subscriberId} />
        </div>
      )}
    </ManagePage>
  );
}
