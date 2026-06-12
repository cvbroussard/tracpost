"use client";

import { ManagePage } from "@/components/manage/manage-page";
import { ProvisioningGraph } from "@/components/manage/provisioning-graph";

export default function Page() {
  return (
    <ManagePage title="Branding Pipeline">
      {({ subscriberId, siteId }) => <ProvisioningGraph subscriberId={subscriberId} siteId={siteId} />}
    </ManagePage>
  );
}
