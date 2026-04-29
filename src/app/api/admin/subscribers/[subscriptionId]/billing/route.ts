import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
import { stripe } from "@/lib/stripe";

interface RouteParams {
  params: Promise<{ subscriptionId: string }>;
}

/**
 * GET /api/admin/subscribers/[subscriptionId]/billing
 * Returns Stripe subscription details, invoices, and available plans.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { subscriptionId } = await params;

  const [sub] = await sql`
    SELECT plan, metadata FROM subscriptions WHERE id = ${subscriptionId}
  `;
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const meta = (sub.metadata || {}) as Record<string, unknown>;
  const stripeMeta = (meta.stripe || {}) as Record<string, string>;
  const customerId = stripeMeta.customer_id || null;
  const stripeSubId = stripeMeta.subscription_id || null;

  if (!customerId || !stripeSubId) {
    return NextResponse.json({
      status: "none",
      plan: sub.plan,
      customerId: null,
      subscriptionId: null,
      currentPeriodEnd: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      invoices: [],
      availablePlans: [],
    });
  }

  try {
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubId) as unknown as {
      status: string;
      current_period_end: number;
      trial_end: number | null;
      cancel_at_period_end: boolean;
      items: { data: Array<{ id: string }> };
    };

    // Get recent invoices
    const invoiceList = await stripe.invoices.list({
      customer: customerId,
      limit: 5,
    });

    const invoices = invoiceList.data.map(inv => ({
      id: inv.id,
      amount: inv.amount_paid || inv.total || 0,
      status: inv.status || "unknown",
      date: new Date((inv.created || 0) * 1000).toISOString(),
      url: inv.hosted_invoice_url || null,
    }));

    // Get available plans for switching
    const products = await sql`
      SELECT id, name, price, stripe_price_id
      FROM products
      WHERE is_active = true AND stripe_price_id IS NOT NULL
      ORDER BY sort_order ASC
    `;

    return NextResponse.json({
      status: stripeSub.status,
      plan: sub.plan,
      currentPeriodEnd: stripeSub.current_period_end
        ? new Date(stripeSub.current_period_end * 1000).toISOString()
        : null,
      trialEnd: stripeSub.trial_end
        ? new Date(stripeSub.trial_end * 1000).toISOString()
        : null,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      customerId,
      subscriptionId: stripeSubId,
      invoices,
      availablePlans: products.map(p => ({
        id: p.id as string,
        name: p.name as string,
        price: p.price as string,
        stripePriceId: p.stripe_price_id as string,
      })),
    });
  } catch (err) {
    console.error("Stripe billing fetch error:", err);
    return NextResponse.json({
      status: "error",
      plan: sub.plan,
      customerId,
      subscriptionId: stripeSubId,
      currentPeriodEnd: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      invoices: [],
      availablePlans: [],
    });
  }
}

/**
 * POST /api/admin/subscribers/[subscriptionId]/billing
 * Body: { action: "cancel" | "reactivate" | "change_plan", price_id?: string }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subscriptionId } = await params;
  const body = await req.json();
  const { action } = body;

  const [sub] = await sql`
    SELECT metadata FROM subscriptions WHERE id = ${subscriptionId}
  `;
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const meta = (sub.metadata || {}) as Record<string, unknown>;
  const stripeMeta = (meta.stripe || {}) as Record<string, string>;
  const stripeSubId = stripeMeta.subscription_id;

  if (!stripeSubId) {
    return NextResponse.json({ error: "No Stripe subscription" }, { status: 400 });
  }

  try {
    if (action === "cancel") {
      await stripe.subscriptions.update(stripeSubId, {
        cancel_at_period_end: true,
      });
      return NextResponse.json({ success: true });
    }

    if (action === "reactivate") {
      await stripe.subscriptions.update(stripeSubId, {
        cancel_at_period_end: false,
      });
      return NextResponse.json({ success: true });
    }

    if (action === "change_plan") {
      const { price_id } = body;
      if (!price_id) return NextResponse.json({ error: "price_id required" }, { status: 400 });

      const stripeSub = await stripe.subscriptions.retrieve(stripeSubId) as unknown as {
        items: { data: Array<{ id: string }> };
      };
      const itemId = stripeSub.items.data[0]?.id;
      if (!itemId) return NextResponse.json({ error: "No subscription item" }, { status: 400 });

      await stripe.subscriptions.update(stripeSubId, {
        items: [{ id: itemId, price: price_id }],
        proration_behavior: "create_prorations",
      });

      // Update local plan
      const { priceToPlan } = await import("@/lib/stripe");
      const newPlan = await priceToPlan(price_id);
      if (newPlan) {
        await sql`UPDATE subscriptions SET plan = ${newPlan}, updated_at = NOW() WHERE id = ${subscriptionId}`;
      }

      return NextResponse.json({ success: true, plan: newPlan });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Stripe billing action error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
