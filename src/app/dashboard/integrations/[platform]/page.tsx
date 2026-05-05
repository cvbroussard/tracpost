import { getSession } from "@/lib/session";
import { redirect, notFound } from "next/navigation";
import { getPlatformBySlug } from "../platform-config";
import { PlatformDetail } from "../platform-detail";

export const dynamic = "force-dynamic";

export default async function PlatformPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { platform: slug } = await params;
  const platform = getPlatformBySlug(slug);
  if (!platform) notFound();

  const siteId = session.activeSiteId;
  if (!siteId) {
    return (
      <div className="p-6">
        <p className="text-xs text-muted">No business selected. Choose a business from the picker to manage connections.</p>
      </div>
    );
  }

  return <PlatformDetail platform={platform} siteId={siteId} />;
}
