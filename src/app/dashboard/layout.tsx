import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login"); // Works on both studio subdomain and localhost

  return (
    <div className="flex h-screen flex-col md:flex-row overflow-hidden">
      <MobileNav subscriberName={session.subscriberName} />
      <div className="hidden md:block">
        <Sidebar subscriberName={session.subscriberName} />
      </div>
      <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
    </div>
  );
}
