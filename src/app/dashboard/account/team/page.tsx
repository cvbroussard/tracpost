import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { TeamMembers } from "./team-members";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Owner-only
  const role = session.role || "owner";
  if (role !== "owner") redirect("/dashboard/account");

  const [subRow, members, sites] = await Promise.all([
    sql`SELECT plan FROM subscriptions WHERE id = ${session.subscriptionId}`,
    sql`
      SELECT id, name, email, phone, role, site_id, notify_via,
             password_hash IS NOT NULL AS has_password,
             session_token_hash IS NOT NULL AS has_device,
             last_active_at, is_active, created_at
      FROM users
      WHERE subscription_id = ${session.subscriptionId}
        AND is_active = true
      ORDER BY
        CASE role WHEN 'owner' THEN 0 WHEN 'member' THEN 1 WHEN 'capture' THEN 2 ELSE 3 END,
        created_at ASC
    `,
    sql`
      SELECT id, name FROM sites
      WHERE subscription_id = ${session.subscriptionId} AND is_active = true
      ORDER BY created_at ASC
    `,
  ]);

  const plan = (subRow[0]?.plan as string) || "free";
  const userLimit = plan === "pro" || plan === "authority" ? 10 : plan === "growth" ? 3 : 2;

  const siteList = sites.map((s) => ({
    id: s.id as string,
    name: s.name as string,
  }));

  const memberList = members.map((m) => ({
    id: m.id as string,
    name: m.name as string,
    email: (m.email as string) || null,
    phone: (m.phone as string) || null,
    role: m.role as string,
    siteId: (m.site_id as string) || null,
    hasPassword: m.has_password as boolean,
    hasDevice: m.has_device as boolean,
    notifyVia: (m.notify_via as string) || "email",
    lastActiveAt: m.last_active_at ? String(m.last_active_at) : null,
    isOwner: m.id === session.userId,
  }));

  return (
    <div className="p-4 space-y-6">
      <h1 className="mb-1 text-lg font-semibold">Team</h1>
      <p className="mb-8 text-sm text-muted">
        Manage users and site access. {memberList.length}/{userLimit} users on {plan} plan.
      </p>

      <TeamMembers
        members={memberList}
        sites={siteList}
        userLimit={userLimit}
        subscriptionId={session.subscriptionId}
      />
    </div>
  );
}
