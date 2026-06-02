"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { BrandIdentityContent } from "../page";

export default function Page() {
  return (
    <ManagePage title="Brand Identity — Creative" requireSite>
      {({ siteId }) => <BrandIdentityContent siteId={siteId} bucket="creative" />}
    </ManagePage>
  );
}
