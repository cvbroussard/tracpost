import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { CampaignsClient } from "./campaigns-client";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  return <CampaignsClient siteId={session.activeSiteId} />;
}
