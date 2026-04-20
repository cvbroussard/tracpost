import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { PerformanceClient } from "./performance-client";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  return <PerformanceClient siteId={session.activeSiteId} />;
}
