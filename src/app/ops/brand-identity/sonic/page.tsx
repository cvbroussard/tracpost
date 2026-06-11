"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { BrandIdentityContent } from "../page";

export default function Page() {
  return (
    <ManagePage title="Brand Identity — Sonic" requireSite>
      {({ siteId }) => <BrandIdentityContent siteId={siteId} domain="sonic" />}
    </ManagePage>
  );
}
