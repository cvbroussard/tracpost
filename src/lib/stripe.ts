/**
 * Stripe integration for TracPost subscriptions.
 *
 * Env vars:
 *   STRIPE_SECRET_KEY
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
 *   STRIPE_WEBHOOK_SECRET
 */
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
});

/** Map Stripe Price IDs to TracPost plan tiers */
export const PRICE_TO_PLAN: Record<string, string> = {
  price_1TCUhD0aYJf9DemmDARvBNRW: "starter",
  price_1TCUt90aYJf9DemmgP6Zwnvg: "growth",
  price_1TCUuH0aYJf9DemmbAYftq3r: "authority",
};

/** Map TracPost plan tiers to Stripe Price IDs */
export const PLAN_TO_PRICE: Record<string, string> = {
  starter: "price_1TCUhD0aYJf9DemmDARvBNRW",
  growth: "price_1TCUt90aYJf9DemmgP6Zwnvg",
  authority: "price_1TCUuH0aYJf9DemmbAYftq3r",
};

/**
 * Create a Stripe Checkout Session for a new subscription.
 */
export async function createCheckoutSession(priceId: string, successUrl: string, cancelUrl: string): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
  });

  return session.url!;
}
