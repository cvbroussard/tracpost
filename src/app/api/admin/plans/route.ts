import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
import { stripe } from "@/lib/stripe";

/**
 * GET /api/admin/plans — list all plans
 * POST /api/admin/plans — create a plan
 * PATCH /api/admin/plans — update a plan
 * DELETE /api/admin/plans — deactivate a plan
 */

export async function GET() {
  const plans = await sql`
    SELECT id, name, tagline, price, frequency, features, cta_text, cta_href,
           highlight, sort_order, stripe_price_id, trial_days, is_active, created_at
    FROM plans
    ORDER BY sort_order ASC, created_at ASC
  `;
  return NextResponse.json({ plans });
}

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, tagline, price, frequency, features, cta_text, cta_href, highlight, sort_order, stripe_price_id } = body;

  if (!name || !price) {
    return NextResponse.json({ error: "name and price required" }, { status: 400 });
  }

  const [plan] = await sql`
    INSERT INTO plans (name, tagline, price, frequency, features, cta_text, cta_href, highlight, sort_order, stripe_price_id, trial_days)
    VALUES (
      ${name},
      ${tagline || null},
      ${price},
      ${frequency || "/month"},
      ${JSON.stringify(features || [])},
      ${cta_text || "Start 7-day trial"},
      ${cta_href || null},
      ${highlight || false},
      ${sort_order || 0},
      ${stripe_price_id || null},
      ${body.trial_days || 7}
    )
    RETURNING id, name
  `;

  return NextResponse.json({ plan });
}

export async function PATCH(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await sql`
    UPDATE plans SET
      name = ${body.name},
      tagline = ${body.tagline || null},
      price = ${body.price},
      frequency = ${body.frequency || "/month"},
      features = ${JSON.stringify(body.features || [])},
      cta_text = ${body.cta_text || "Start 14-day trial"},
      cta_href = ${body.cta_href || null},
      highlight = ${body.highlight || false},
      sort_order = ${body.sort_order || 0},
      stripe_price_id = ${body.stripe_price_id || null},
      trial_days = ${body.trial_days || 7},
      is_active = ${body.is_active !== undefined ? body.is_active : true},
      updated_at = NOW()
    WHERE id = ${id}
  `;

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await sql`UPDATE plans SET is_active = false, updated_at = NOW() WHERE id = ${id}`;

  // Archive in Stripe if linked
  const [plan] = await sql`SELECT stripe_price_id FROM plans WHERE id = ${id}`;
  if (plan?.stripe_price_id) {
    try {
      const price = await stripe.prices.retrieve(plan.stripe_price_id as string);
      if (price.product && typeof price.product === "string") {
        await stripe.products.update(price.product, { active: false });
      }
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ success: true });
}

/**
 * PUT /api/admin/plans — Stripe sync actions
 * Body: { id, action: "create_stripe" | "sync_stripe" }
 */
export async function PUT(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, action } = await req.json();
  if (!id || !action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  const [plan] = await sql`
    SELECT name, tagline, price, frequency, stripe_price_id
    FROM plans WHERE id = ${id}
  `;
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  if (action === "create_stripe") {
    // Parse price amount (remove $ and convert to cents)
    const priceStr = (plan.price as string).replace(/[^0-9.]/g, "");
    const amountCents = Math.round(parseFloat(priceStr) * 100);

    if (!amountCents || isNaN(amountCents)) {
      return NextResponse.json({ error: "Cannot parse price amount" }, { status: 400 });
    }

    // Create Stripe Product + Price
    const stripeProduct = await stripe.products.create({
      name: plan.name as string,
      description: (plan.tagline as string) || undefined,
    });

    const stripePrice = await stripe.prices.create({
      product: stripeProduct.id,
      unit_amount: amountCents,
      currency: "usd",
      recurring: { interval: "month" },
    });

    await sql`UPDATE plans SET stripe_price_id = ${stripePrice.id}, updated_at = NOW() WHERE id = ${id}`;

    return NextResponse.json({
      success: true,
      stripe_product_id: stripeProduct.id,
      stripe_price_id: stripePrice.id,
    });
  }

  if (action === "sync_stripe") {
    if (!plan.stripe_price_id) {
      return NextResponse.json({ error: "No Stripe price linked" }, { status: 400 });
    }

    // Update Stripe product name/description
    const price = await stripe.prices.retrieve(plan.stripe_price_id as string);
    if (price.product && typeof price.product === "string") {
      await stripe.products.update(price.product, {
        name: plan.name as string,
        description: (plan.tagline as string) || undefined,
      });
    }

    return NextResponse.json({ success: true, synced: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
