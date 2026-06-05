"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { ObservationView } from "./observation-view";

export default function Page() {
  return (
    <ManagePage title="Brand Identity — Public Presence" requireSite>
      {({ siteId }) => <ObservationView siteId={siteId} />}
    </ManagePage>
  );
}
