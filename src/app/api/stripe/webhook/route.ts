import { NextRequest, NextResponse } from "next/server";
import { stripe, PRICE_TO_PLAN } from "@/lib/stripe";
import { sql } from "@/lib/db";
import { generateMagicToken } from "@/lib/magic-link";
import { sendWelcomeEmail } from "@/lib/email";
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
      await handleCheckoutCompleted(event.data.object as unknown as Record<string, unknown>);
      break;
    }
    case "customer.subscription.updated": {
      await handleSubscriptionUpdated(event.data.object as unknown as Record<string, unknown>);
      break;
    }
    case "customer.subscription.deleted": {
      await handleSubscriptionDeleted(event.data.object as unknown as Record<string, unknown>);
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

  // Check if subscription already exists (re-subscribe) by owner email
  const [existing] = await sql`
    SELECT s.id
    FROM subscriptions s
    JOIN users u ON u.subscription_id = s.id AND u.role = 'owner'
    WHERE u.email = ${email}
  `;

  if (existing) {
    // Reactivate existing subscription
    await sql`
      UPDATE subscriptions
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
      await sql`UPDATE subscriptions SET plan = ${plan} WHERE id = ${existing.id}`;
    }

    // Generate magic link for returning subscriber
    const token = await generateMagicToken(existing.id);
    const magicUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://tracpost.com"}/auth/magic?token=${token}`;
    await sendWelcomeEmail(email, magicUrl, false);

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

  // Create subscription (billing entity)
  const [subscription] = await sql`
    INSERT INTO subscriptions (api_key_hash, plan, is_active, metadata)
    VALUES (
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

  // Create owner user attached to the subscription
  const [owner] = await sql`
    INSERT INTO users (subscription_id, name, email, role, is_active)
    VALUES (
      ${subscription.id},
      ${email.split("@")[0]},
      ${email},
      'owner',
      true
    )
    RETURNING id
  `;

  // Generate magic link
  const token = await generateMagicToken(owner.id);
  const magicUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://tracpost.com"}/auth/magic?token=${token}`;
  await sendWelcomeEmail(email, magicUrl, true);

  // Log
  await sql`
    INSERT INTO usage_log (subscription_id, action, metadata)
    VALUES (${subscription.id}, 'stripe_checkout', ${JSON.stringify({
      plan,
      customer_id: customerId,
    })})
  `;

  console.log(`Stripe: provisioned new subscription ${subscription.id} (${email}, ${plan})`);
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
    UPDATE subscriptions
    SET plan = ${plan}, updated_at = NOW()
    WHERE metadata @> ${JSON.stringify({ stripe: { customer_id: customerId } })}::jsonb
  `;

  console.log(`Stripe: updated plan to ${plan} for customer ${customerId}`);
}

/**
 * Subscription deleted → cancel subscription.
 */
async function handleSubscriptionDeleted(subscription: Record<string, unknown>) {
  const customerId = subscription.customer as string;
  if (!customerId) return;

  await sql`
    UPDATE subscriptions
    SET cancelled_at = NOW(), updated_at = NOW()
    WHERE metadata @> ${JSON.stringify({ stripe: { customer_id: customerId } })}::jsonb
  `;

  console.log(`Stripe: cancelled subscription for customer ${customerId}`);
}

