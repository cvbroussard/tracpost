import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { AccountProfile } from "./account-profile";

export const dynamic = "force-dynamic";

export default async function MyAccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [subscriber] = await sql`
    SELECT id, name, email, phone, role,
           password_hash IS NOT NULL AS has_password,
           session_token_hash IS NOT NULL AS has_device
    FROM users
    WHERE id = ${session.userId}
  `;

  if (!subscriber) redirect("/login");

  const role = (session.role || "owner") as string;
  const isOwner = role === "owner";

  return (
    <div className="p-4 space-y-6">
      <h1>My Account</h1>
      <p className="mt-2 mb-8 text-muted">Your profile and preferences</p>

      {/* Profile */}
      <section className="mb-8">
        <h2 className="mb-4">Profile</h2>
        <div className="space-y-3">
          <div className="flex items-baseline justify-between border-b border-border py-2">
            <span className="text-sm text-muted">Email</span>
            <span className="font-medium">{subscriber.email || "—"}</span>
          </div>
          <AccountProfile
            userId={subscriber.id as string}
            initialName={subscriber.name as string}
            initialPhone={(subscriber.phone as string) || ""}
            hasPassword={subscriber.has_password as boolean}
          />
          <div className="flex items-baseline justify-between border-b border-border py-2">
            <span className="text-sm text-muted">Role</span>
            <span className="font-medium capitalize">{role}</span>
          </div>
          <div className="flex items-baseline justify-between border-b border-border py-2">
            <span className="text-sm text-muted">Mobile App</span>
            <span className={`text-xs ${subscriber.has_device ? "text-success" : "text-muted"}`}>
              {subscriber.has_device ? "Connected" : "Not installed"}
            </span>
          </div>
        </div>
      </section>

      {/* Quick links for owners */}
      {isOwner && (
        <section>
          <h2 className="mb-4">Account Management</h2>
          <div className="grid grid-cols-2 gap-3">
            <a
              href="/dashboard/account/subscription"
              className="rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-accent/40"
            >
              <p className="text-sm font-medium">Subscription</p>
              <p className="text-xs text-muted">Plan, billing, and API key</p>
            </a>
            <a
              href="/dashboard/account/team"
              className="rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-accent/40"
            >
              <p className="text-sm font-medium">Team</p>
              <p className="text-xs text-muted">Users and site access</p>
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
