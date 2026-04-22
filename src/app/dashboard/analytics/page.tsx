import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { OverviewClient } from "./overview-client";

export const dynamic = "force-dynamic";

export default async function AnalyticsOverviewPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  return <OverviewClient siteId={session.activeSiteId} />;
}
