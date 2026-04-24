"use client";

import { ManagePage } from "@/components/manage/manage-page";
import { ProvisioningPipeline } from "@/components/manage/provisioning-pipeline";

export default function Page() {
  return (
    <ManagePage title="Provisioning">
      {({ subscriberId }) => <ProvisioningPipeline subscriberId={subscriberId} />}
    </ManagePage>
  );
}
