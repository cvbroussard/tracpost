import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { AccountProfile } from "./account-profile";
import { SitesSection } from "./sites-section";
import { ApiKeySection } from "../settings/api-key-section";
import { AccountActions } from "../settings/account-actions";

export const dynamic = "force-dynamic";

export default async function MyAccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [subscriber] = await sql`
    SELECT id, name, email, plan, password_hash IS NOT NULL AS has_password,
           metadata, cancelled_at, created_at
    FROM subscribers
    WHERE id = ${session.subscriberId}
  `;

  if (!subscriber) redirect("/login");

  const meta = (subscriber.metadata || {}) as Record<string, unknown>;
  const stripe = meta.stripe as Record<string, string> | undefined;

  // Fetch owner team member for phone
  const [ownerMember] = await sql`
    SELECT phone, last_active_at,
           session_token_hash IS NOT NULL AS has_device
    FROM team_members
    WHERE subscriber_id = ${session.subscriberId} AND role = 'owner'
    LIMIT 1
  `;

  // Fetch all sites for this subscriber
  const allSites = await sql`
    SELECT id, name, business_type, location, provisioning_status,
           autopilot_enabled, deleted_at, created_at
    FROM sites
    WHERE subscriber_id = ${session.subscriberId}
    ORDER BY deleted_at ASC NULLS FIRST, created_at DESC
  `;

  const sitesData = allSites.map((s) => ({
    id: s.id as string,
    name: s.name as string,
    business_type: (s.business_type as string) || null,
    location: (s.location as string) || null,
    provisioning_status: (s.provisioning_status as string) || null,
    autopilot_enabled: s.autopilot_enabled as boolean,
    deleted_at: s.deleted_at ? String(s.deleted_at) : null,
    created_at: s.created_at as string,
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <h1>My Account</h1>
      <p className="mt-2 mb-8 text-muted">Manage your profile, sites, and billing</p>

      {/* Profile */}
      <section className="mb-8">
        <h2 className="mb-4">Profile</h2>
        <div className="space-y-3">
          <div className="flex items-baseline justify-between border-b border-border py-2">
            <span className="text-sm text-muted">Email</span>
            <span className="font-medium">{subscriber.email || "—"}</span>
          </div>
          <AccountProfile
            subscriberId={subscriber.id as string}
            initialName={subscriber.name as string}
            initialPhone={(ownerMember?.phone as string) || ""}
            hasPassword={subscriber.has_password as boolean}
          />
          <div className="flex items-baseline justify-between border-b border-border py-2">
            <span className="text-sm text-muted">Mobile App</span>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${ownerMember?.has_device ? "text-success" : "text-muted"}`}>
                {ownerMember?.has_device ? "Connected" : "Not installed"}
              </span>
              <a
                href="/dashboard/account/mobile-app"
                className="text-xs text-accent hover:underline"
              >
                Manage
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Sites */}
      <SitesSection initialSites={sitesData} />

      {/* Plan & Billing */}
      <section className="mb-8">
        <h2 className="mb-4">Plan & Billing</h2>
        <div className="space-y-3">
          <div className="flex items-baseline justify-between border-b border-border py-2">
            <span className="text-sm text-muted">Current plan</span>
            <span className="font-medium capitalize">{subscriber.plan || "—"}</span>
          </div>
          <div className="flex items-baseline justify-between border-b border-border py-2">
            <span className="text-sm text-muted">Member since</span>
            <span className="font-medium">
              {new Date(subscriber.created_at as string).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
          {stripe?.customer_id && (
            <div className="pt-2">
              <a
                href={`https://billing.stripe.com/p/login/test_${stripe.customer_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-foreground hover:text-foreground"
                style={{ display: "inline-block" }}
              >
                Manage billing on Stripe
              </a>
            </div>
          )}
        </div>
      </section>

      {/* API Key */}
      <ApiKeySection />

      {/* Account Actions: Data Export + Cancel Account */}
      <AccountActions
        cancelledAt={subscriber?.cancelled_at ? String(subscriber.cancelled_at) : null}
      />
    </div>
  );
}
