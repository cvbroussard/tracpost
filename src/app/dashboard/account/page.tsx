import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { AccountProfile } from "./account-profile";
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

  return (
    <div className="mx-auto max-w-4xl">
      <h1>My Account</h1>
      <p className="mt-2 mb-8 text-muted">Manage your profile, security, and billing</p>

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
            hasPassword={subscriber.has_password as boolean}
          />
        </div>
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

      {/* API Key */}
      <ApiKeySection />

      {/* Account Actions: Data Export + Cancel Account */}
      <AccountActions
        cancelledAt={subscriber?.cancelled_at ? String(subscriber.cancelled_at) : null}
      />
    </div>
  );
}
