import { NextRequest, NextResponse } from "next/server";
import { stripe, PRICE_TO_PLAN } from "@/lib/stripe";
import { sql } from "@/lib/db";
import { generateMagicToken } from "@/lib/magic-link";
import { randomBytes, createHash } from "node:crypto";

/**
 * POST /api/stripe/webhook
 *
 * Handles Stripe webhook events:
 * - checkout.session.completed → provision new subscriber
 * - customer.subscription.updated → plan changes
 * - customer.subscription.deleted → cancellation
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("Stripe webhook signature verification failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      await handleCheckoutCompleted(session);
      break;
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      await handleSubscriptionUpdated(subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      await handleSubscriptionDeleted(subscription);
      break;
    }
    default:
      console.log(`Unhandled Stripe event: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}

/**
 * New checkout completed → provision subscriber.
 */
async function handleCheckoutCompleted(session: Record<string, unknown>) {
  const email = session.customer_email as string || (session.customer_details as Record<string, unknown>)?.email as string;
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (!email) {
    console.error("Stripe checkout: no email found");
    return;
  }

  // Check if subscriber already exists (re-subscribe)
  const [existing] = await sql`
    SELECT id FROM subscribers WHERE email = ${email}
  `;

  if (existing) {
    // Reactivate existing subscriber
    await sql`
      UPDATE subscribers
      SET is_active = true,
          cancelled_at = NULL,
          cancel_reason = NULL,
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{stripe}',
            ${JSON.stringify({ customer_id: customerId, subscription_id: subscriptionId })}::jsonb
          ),
          updated_at = NOW()
      WHERE id = ${existing.id}
    `;

    // Update plan from subscription
    if (subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = sub.items.data[0]?.price.id;
      const plan = PRICE_TO_PLAN[priceId] || "starter";
      await sql`UPDATE subscribers SET plan = ${plan} WHERE id = ${existing.id}`;
    }

    // Generate magic link for returning subscriber
    const token = await generateMagicToken(existing.id);
    await sendWelcomeEmail(email, token, false);

    console.log(`Stripe: reactivated subscriber ${existing.id} (${email})`);
    return;
  }

  // Determine plan from subscription
  let plan = "starter";
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = sub.items.data[0]?.price.id;
      plan = PRICE_TO_PLAN[priceId] || "starter";
    } catch {
      console.warn("Could not retrieve subscription for plan mapping");
    }
  }

  // Generate API key
  const apiKeyRaw = `tp_${randomBytes(24).toString("hex")}`;
  const apiKeyHash = createHash("sha256").update(apiKeyRaw).digest("hex");

  // Create subscriber
  const [subscriber] = await sql`
    INSERT INTO subscribers (name, email, api_key_hash, plan, is_active, metadata)
    VALUES (
      ${email.split("@")[0]},
      ${email},
      ${apiKeyHash},
      ${plan},
      true,
      ${JSON.stringify({
        stripe: { customer_id: customerId, subscription_id: subscriptionId },
        api_key_preview: apiKeyRaw.slice(0, 8) + "...",
        onboarding_status: "new",
      })}
    )
    RETURNING id
  `;

  // Generate magic link
  const token = await generateMagicToken(subscriber.id);
  await sendWelcomeEmail(email, token, true);

  // Log
  await sql`
    INSERT INTO usage_log (subscriber_id, action, metadata)
    VALUES (${subscriber.id}, 'stripe_checkout', ${JSON.stringify({
      plan,
      customer_id: customerId,
    })})
  `;

  console.log(`Stripe: provisioned new subscriber ${subscriber.id} (${email}, ${plan})`);
}

/**
 * Subscription updated → sync plan tier.
 */
async function handleSubscriptionUpdated(subscription: Record<string, unknown>) {
  const customerId = subscription.customer as string;
  const items = subscription.items as Record<string, unknown>;
  const data = (items?.data as Array<Record<string, unknown>>) || [];
  const priceId = (data[0]?.price as Record<string, unknown>)?.id as string;

  if (!priceId || !customerId) return;

  const plan = PRICE_TO_PLAN[priceId] || "starter";

  await sql`
    UPDATE subscribers
    SET plan = ${plan}, updated_at = NOW()
    WHERE metadata->>'stripe'->>'customer_id' = ${customerId}
       OR metadata @> ${JSON.stringify({ stripe: { customer_id: customerId } })}::jsonb
  `;

  console.log(`Stripe: updated plan to ${plan} for customer ${customerId}`);
}

/**
 * Subscription deleted → cancel subscriber.
 */
async function handleSubscriptionDeleted(subscription: Record<string, unknown>) {
  const customerId = subscription.customer as string;
  if (!customerId) return;

  await sql`
    UPDATE subscribers
    SET cancelled_at = NOW(), updated_at = NOW()
    WHERE metadata @> ${JSON.stringify({ stripe: { customer_id: customerId } })}::jsonb
  `;

  console.log(`Stripe: cancelled subscription for customer ${customerId}`);
}

/**
 * Send welcome email with magic link.
 * TODO: integrate with email provider (Resend, SES, etc.)
 * For now, logs the magic link URL.
 */
async function sendWelcomeEmail(email: string, magicToken: string, isNew: boolean) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tracpost.com";
  const magicUrl = `${baseUrl}/auth/magic?token=${magicToken}`;

  // TODO: Replace with actual email sending (Resend, SES)
  console.log(`\n${"=".repeat(60)}`);
  console.log(`WELCOME EMAIL → ${email}`);
  console.log(`Type: ${isNew ? "New subscriber" : "Returning subscriber"}`);
  console.log(`Magic link: ${magicUrl}`);
  console.log(`${"=".repeat(60)}\n`);
}
