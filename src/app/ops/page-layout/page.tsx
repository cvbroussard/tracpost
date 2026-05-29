"use client";
import { ManagePage } from "@/components/manage/manage-page";
export default function Page() {
  return <ManagePage title="Page Layout" requireSite>{({ siteId }) => <div className="p-6"><p className="text-xs text-muted">Page layout for site {siteId}</p></div>}</ManagePage>;
}
