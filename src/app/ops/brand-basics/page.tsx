"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { BrandBasicsClient } from "./brand-basics-client";

export default function Page() {
  return (
    <ManagePage title="Brand Basics">
      {({ subscriberId }) => <BrandBasicsClient subscriberId={subscriberId} />}
    </ManagePage>
  );
}
