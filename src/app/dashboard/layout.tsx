import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const activeSite = session.sites.find((s) => s.id === session.activeSiteId) || session.sites[0];

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="hidden md:block">
        <TopBar subscriberName={session.subscriberName} />
        <PageHeader siteName={activeSite?.name || "TracPost"} />
      </div>
      <MobileNav subscriberName={session.subscriberName} />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:block">
          <Sidebar
            subscriberName={session.subscriberName}
            sites={session.sites}
            activeSiteId={session.activeSiteId}
          />
        </div>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
