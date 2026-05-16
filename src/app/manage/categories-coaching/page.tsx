"use client";
import { ManagePage } from "@/components/manage/manage-page";
import { CategoriesCoachingClient } from "./coaching-client";

export default function Page() {
  return (
    <ManagePage title="GBP Categories Coaching">
      {({ subscriberId }) => <CategoriesCoachingClient subscriberId={subscriberId} />}
    </ManagePage>
  );
}
