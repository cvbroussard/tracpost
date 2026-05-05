import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { stripe } from "@/lib/stripe";

/**
 * POST /api/checkout
 * Body: { product_id: UUID }
 * Creates a Stripe Checkout session with 14-day trial and redirects.
 */
export async function POST(req: NextRequest) {
  const { product_id, skip_trial, customer_email } = await req.json();

  if (!product_id) {
    return NextResponse.json({ error: "product_id required" }, { status: 400 });
  }

  const [plan] = await sql`
    SELECT name, stripe_price_id, cta_href, trial_days
    FROM plans
    WHERE id = ${product_id} AND is_active = true
  `;

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  if (!plan.stripe_price_id) {
    return NextResponse.json({ error: "No Stripe price configured for this plan" }, { status: 400 });
  }

  const origin = req.headers.get("origin") || "https://tracpost.com";

  const trialDays = skip_trial ? undefined : ((plan.trial_days as number) || 7);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: plan.stripe_price_id as string, quantity: 1 }],
    ...(trialDays ? { subscription_data: { trial_period_days: trialDays } } : {}),
    ...(customer_email ? { customer_email } : {}),
    success_url: `${origin}/setup?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
