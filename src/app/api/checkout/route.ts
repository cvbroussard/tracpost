import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { stripe } from "@/lib/stripe";

/**
 * POST /api/checkout
 * Body: { product_id: UUID }
 * Creates a Stripe Checkout session with 14-day trial and redirects.
 */
export async function POST(req: NextRequest) {
  const { product_id } = await req.json();

  if (!product_id) {
    return NextResponse.json({ error: "product_id required" }, { status: 400 });
  }

  const [product] = await sql`
    SELECT name, stripe_price_id, cta_href
    FROM products
    WHERE id = ${product_id} AND is_active = true
  `;

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  if (!product.stripe_price_id) {
    return NextResponse.json({ error: "No Stripe price configured for this product" }, { status: 400 });
  }

  const origin = req.headers.get("origin") || "https://tracpost.com";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: product.stripe_price_id as string, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
    },
    success_url: `${origin}/setup?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
