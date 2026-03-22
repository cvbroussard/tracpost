import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { InboxTabs } from "@/components/inbox/inbox-tabs";

export const dynamic = "force-dynamic";

export default async function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-4 pt-4">
        <h1 className="mb-3 text-lg font-medium">Inbox</h1>
        <InboxTabs siteId={session.activeSiteId} />
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
