"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { BrandIdentityContent } from "../page";

export default function Page() {
  return (
    <ManagePage title="Brand Identity — Strategic" requireSite>
      {({ siteId }) => <BrandIdentityContent siteId={siteId} domain="strategic" />}
    </ManagePage>
  );
}
