"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { BrandIdentityContent } from "../page";

export default function Page() {
  return (
    <ManagePage title="Brand Identity — Statistical" requireSite>
      {({ siteId }) => <BrandIdentityContent siteId={siteId} bucket="statistical" />}
    </ManagePage>
  );
}
