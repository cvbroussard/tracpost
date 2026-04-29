import { sql } from "@/lib/db";
import { TestSubsClient } from "./client";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  plan: string;
  status: string;
  is_test: boolean;
  created_at: string;
  metadata: Record<string, unknown>;
  owner_email: string | null;
  owner_name: string | null;
  site_count: number;
}

export default async function TestSubscriptionsPage() {
  const rows = (await sql`
    SELECT
      s.id, s.plan, s.status, s.is_test, s.created_at, s.metadata,
      u.email AS owner_email,
      u.name AS owner_name,
      (SELECT COUNT(*)::int FROM sites WHERE subscription_id = s.id) AS site_count
    FROM subscriptions s
    LEFT JOIN users u ON u.subscription_id = s.id AND u.role = 'owner'
    WHERE s.is_test = true
    ORDER BY s.created_at DESC
  `) as unknown as Row[];

  return (
    <div className="mx-auto max-w-5xl">
      <h1>Test Subscriptions</h1>
      <p className="mt-2 mb-6 text-muted">
        Synthetic accounts flagged with <code>is_test = true</code>. Wipe individually or in bulk.
        Each wipe cancels the Stripe subscription, deletes the Stripe test customer, and cascades
        the DB delete (sites, users, posts, media, all of it). Audit trail kept in{" "}
        <code>wipe_log</code>.
      </p>

      <TestSubsClient initialRows={rows} />
    </div>
  );
}
