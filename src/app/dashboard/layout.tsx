import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login"); // Works on both studio subdomain and localhost

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar subscriberName={session.subscriberName} />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
