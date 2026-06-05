"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { ReadinessFindingsView } from "./readiness-findings-view";

export default function Page() {
  return (
    <ManagePage title="Brand Identity — Readiness Findings" requireSite>
      {({ siteId }) => <ReadinessFindingsView siteId={siteId} />}
    </ManagePage>
  );
}
