import { sql } from "@/lib/db";
import { ErasureClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ComplianceErasurePage() {
  const wipes = await sql`
    SELECT
      id, subscription_id, reason, operator_id, notes,
      stripe_subscription_id, stripe_customer_id,
      stripe_subscription_cancelled, stripe_customer_deleted,
      wiped_at
    FROM wipe_log
    WHERE reason = 'compliance_erasure'
    ORDER BY wiped_at DESC
    LIMIT 50
  `;

  return (
    <div className="mx-auto max-w-4xl">
      <h1>Compliance Erasure</h1>
      <p className="mt-2 mb-6 text-muted">
        Operator-only path for processing GDPR Article 17 / CCPA right-to-delete requests.
        Stripe customer record is retained (financial-retention exemption); the rest of the
        subscription cascade is removed. All erasures are logged in <code>wipe_log</code> for
        audit purposes.
      </p>

      <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Use this only for legal erasure requests.</strong> Test subscriptions go through{" "}
        <a href="/admin/test-subscriptions" className="underline">Test Subscriptions</a>.
        Regular cancellations follow the lifecycle (cancel-grace → archive).
      </div>

      <ErasureClient />

      <h2 className="mt-12 mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Recent erasures
      </h2>
      {wipes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
          No compliance erasures on record.
        </p>
      ) : (
        <div className="space-y-2">
          {wipes.map((w) => (
            <div
              key={w.id as string}
              className="rounded-xl border border-border bg-surface px-5 py-3 text-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-foreground">
                    {w.subscription_id as string}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {new Date(w.wiped_at as string).toLocaleString()} · operator{" "}
                    {(w.operator_id as string) || "unknown"}
                  </div>
                  {w.notes && (
                    <div className="mt-2 rounded bg-background px-2 py-1 text-xs text-foreground">
                      {w.notes as string}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right text-[11px] text-dim">
                  {w.stripe_subscription_cancelled ? (
                    <div>✓ Stripe cancelled</div>
                  ) : (
                    <div className="text-amber-600">! Stripe not cancelled</div>
                  )}
                  {w.stripe_customer_deleted ? <div>✓ Customer deleted</div> : <div>retained</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
