import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { AnalyticsTabs } from "@/components/analytics/analytics-tabs";

export const dynamic = "force-dynamic";

export default async function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-4 pt-1">
        <h1 className="mb-3 text-lg font-medium">Analytics</h1>
        <AnalyticsTabs />
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
