/**
 * Subscription wipe — shared cascade for test-subscription cleanup AND
 * compliance erasure (GDPR/CCPA).
 *
 * Both callers reach the same endpoint behavior:
 *   1. Cancel + optionally delete the Stripe customer
 *   2. DELETE FROM subscriptions (DB cascades to users, sites, posts,
 *      media, engagements, notifications, onboarding_submissions, etc.)
 *   3. Write an audit log entry recording the wipe with reason + caller
 *
 * The only difference between the two callers is the `reason` string and
 * whether Stripe customer deletion is allowed (test mode → yes; live mode
 * → cancel only, retain Stripe records for financial-retention compliance).
 */
import "server-only";
import { sql } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export interface WipeOptions {
  reason: "test_cleanup" | "compliance_erasure";
  operatorId?: string | null;
  notes?: string | null;
}

export interface WipeResult {
  subscription_id: string;
  stripe_subscription_cancelled: boolean;
  stripe_customer_deleted: boolean;
  rows_deleted: number;
  error: string | null;
}

export async function wipeSubscription(
  subscriptionId: string,
  opts: WipeOptions
): Promise<WipeResult> {
  const result: WipeResult = {
    subscription_id: subscriptionId,
    stripe_subscription_cancelled: false,
    stripe_customer_deleted: false,
    rows_deleted: 0,
    error: null,
  };

  // Look up subscription + Stripe references before deleting anything.
  const [sub] = await sql`
    SELECT id, metadata, is_test FROM subscriptions WHERE id = ${subscriptionId}
  `;

  if (!sub) {
    result.error = "Subscription not found";
    return result;
  }

  const metadata = (sub.metadata || {}) as Record<string, unknown>;
  const stripeRefs = (metadata.stripe || {}) as Record<string, string>;
  const stripeCustomerId = stripeRefs.customer_id;
  const stripeSubscriptionId = stripeRefs.subscription_id;

  // 1) Cancel Stripe subscription if one exists.
  if (stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(stripeSubscriptionId);
      result.stripe_subscription_cancelled = true;
    } catch (err) {
      console.warn(
        `Stripe subscription cancel failed for ${stripeSubscriptionId}:`,
        err instanceof Error ? err.message : err
      );
      // Non-fatal — continue with DB wipe.
    }
  }

  // 2) Delete Stripe customer ONLY for test rows. In live mode we retain
  //    Stripe records for financial-retention compliance.
  if (stripeCustomerId && sub.is_test === true) {
    try {
      await stripe.customers.del(stripeCustomerId);
      result.stripe_customer_deleted = true;
    } catch (err) {
      console.warn(
        `Stripe customer delete failed for ${stripeCustomerId}:`,
        err instanceof Error ? err.message : err
      );
      // Non-fatal — continue.
    }
  }

  // 3) Audit log BEFORE the DB cascade — usage_log will cascade-delete with
  //    the subscription, so we capture this entry on a parent table that
  //    isn't tied to the subscription.
  // Using `wipe_log` (created by migration 061 alongside this code).
  try {
    await sql`
      INSERT INTO wipe_log (
        subscription_id, reason, operator_id, notes,
        stripe_subscription_id, stripe_customer_id,
        stripe_subscription_cancelled, stripe_customer_deleted,
        wiped_at
      ) VALUES (
        ${subscriptionId}, ${opts.reason}, ${opts.operatorId || null}, ${opts.notes || null},
        ${stripeSubscriptionId || null}, ${stripeCustomerId || null},
        ${result.stripe_subscription_cancelled}, ${result.stripe_customer_deleted},
        NOW()
      )
    `;
  } catch (err) {
    console.warn("wipe_log insert failed (non-fatal):", err instanceof Error ? err.message : err);
  }

  // 4) DB cascade delete. All FKs to subscriptions are ON DELETE CASCADE.
  try {
    const deleted = await sql`
      DELETE FROM subscriptions WHERE id = ${subscriptionId}
    `;
    result.rows_deleted = (deleted as unknown as { rowCount?: number }).rowCount || 1;
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Delete failed";
  }

  return result;
}
