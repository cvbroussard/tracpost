import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { TopBar } from "@/components/topbar";

export const metadata = {
  title: "TracPost — Agency",
};

/**
 * Agency console shell. Self-gates server-side: only an agency (account-scoped)
 * or platform (super-admin) principal may enter. This is the authoritative gate
 * — it holds regardless of how the route is reached (subdomain rewrite, staging
 * host, etc.), not only the middleware subdomain block.
 */
export default async function AgyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.principalType !== "agency" && session.principalType !== "platform") {
    redirect("/login");
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar userName={session.userName} variant="agy" />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
