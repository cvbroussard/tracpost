import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { SubscriptionName } from "./subscription-name";
import { SitesSection } from "../sites-section";
import { ApiKeySection } from "../../settings/api-key-section";
import { AccountActions } from "../../settings/account-actions";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Owner-only
  const role = session.role || "owner";
  if (role !== "owner") redirect("/dashboard/account");

  const [subscriber] = await sql`
    SELECT id, name, plan, metadata, cancelled_at, created_at
    FROM subscriptions
    WHERE id = ${session.subscriptionId}
  `;

  if (!subscriber) redirect("/login");

  const meta = (subscriber.metadata || {}) as Record<string, unknown>;
  const stripe = meta.stripe as Record<string, string> | undefined;

  const allSites = await sql`
    SELECT id, name, business_type, location, provisioning_status,
           autopilot_enabled, is_active, created_at
    FROM sites
    WHERE subscription_id = ${session.subscriptionId}
    ORDER BY is_active DESC, created_at DESC
  `;

  const sitesData = allSites.map((s) => ({
    id: s.id as string,
    name: s.name as string,
    business_type: (s.business_type as string) || null,
    location: (s.location as string) || null,
    provisioning_status: (s.provisioning_status as string) || null,
    autopilot_enabled: s.autopilot_enabled as boolean,
    is_active: s.is_active !== false,
    created_at: s.created_at as string,
  }));

  return (
    <div className="p-4 space-y-6">
      <h1>Subscription</h1>
      <p className="mt-2 mb-8 text-muted">Plan, billing, and account settings</p>

      {/* Business Name */}
      <section className="mb-8">
        <h2 className="mb-4">Business</h2>
        <SubscriptionName
          subscriptionId={session.subscriptionId}
          initialName={(subscriber.name as string) || ""}
        />
      </section>

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

      {/* Sites */}
      <SitesSection initialSites={sitesData} />

      {/* API Key */}
      <ApiKeySection />

      {/* Account Actions: Data Export + Cancel Account */}
      <AccountActions
        cancelledAt={subscriber?.cancelled_at ? String(subscriber.cancelled_at) : null}
      />
    </div>
  );
}
