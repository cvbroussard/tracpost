"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { CompetitiveAnalysisClient } from "./cma-client";

export default function Page() {
  return (
    <ManagePage title="Competitive Analysis" requireSite>
      {({ siteId }) => <CompetitiveAnalysisClient siteId={siteId} />}
    </ManagePage>
  );
}
