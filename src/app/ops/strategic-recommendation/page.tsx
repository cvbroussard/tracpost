"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { StrategicRecommendationClient } from "./strategic-rec-client";

export default function Page() {
  return (
    <ManagePage title="Strategic Recommendation">
      {({ subscriberId }) => <StrategicRecommendationClient subscriberId={subscriberId} />}
    </ManagePage>
  );
}
