import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { SearchClient } from "./search-client";

export const dynamic = "force-dynamic";

export default async function SeoSearchPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!session.activeSiteId) {
    return (
      <div className="p-4 space-y-6">
        <h1 className="mb-1 text-lg font-semibold">Search Performance</h1>
        <p className="py-12 text-center text-sm text-muted">Add a site first.</p>
      </div>
    );
  }

  return <SearchClient siteId={session.activeSiteId} />;
}
