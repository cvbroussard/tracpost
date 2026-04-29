/**
 * POST /api/onboarding/start
 * Body: { product_id, email, name, phone? }
 *
 * Replaces the redirect-based /api/checkout. Creates everything needed
 * for the self-hosted Stripe Elements card form to authorize payment
 * inline, then hand off to the onboarding form.
 *
 * Synchronously:
 *   1. Look up product + Stripe price
 *   2. Save/update lead (existing /api/leads logic inline)
 *   3. Create Stripe Customer
 *   4. Create Stripe Subscription with trial + payment_behavior=default_incomplete
 *   5. Create DB subscription record (+ owner user)
 *   6. Create onboarding_submissions row + token
 *   7. Return { client_secret, onboarding_token, intent_type }
 *
 * Frontend then mounts Stripe Elements with the client_secret, user
 * confirms payment, and we redirect to /onboarding/{token}.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { stripe, PRICE_TO_PLAN } from "@/lib/stripe";
import { createSubmission } from "@/lib/onboarding/queries";
import { randomBytes, createHash } from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

interface StartBody {
  product_id?: string;
  email?: string;
  name?: string;
  phone?: string;
  skip_trial?: boolean;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as StartBody;
  const { product_id, email, name, phone, skip_trial } = body;

  // ── Validation ──────────────────────────────────────────────────────
  if (!product_id) return NextResponse.json({ error: "product_id required" }, { status: 400 });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }
  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) {
      return NextResponse.json({ error: "invalid phone" }, { status: 400 });
    }
  }
  const emailClean = email.toLowerCase().trim();
  const nameClean = name.trim();
  const phoneClean = phone?.trim() || null;

  // ── Product lookup ──────────────────────────────────────────────────
  const [product] = await sql`
    SELECT id, name, stripe_price_id, trial_days
    FROM products
    WHERE id = ${product_id} AND is_active = true
  `;
  if (!product) return NextResponse.json({ error: "product not found" }, { status: 404 });
  if (!product.stripe_price_id) {
    return NextResponse.json({ error: "no Stripe price configured for this product" }, { status: 400 });
  }
  const trialDays = skip_trial ? 0 : ((product.trial_days as number) || 7);
  const plan = PRICE_TO_PLAN[product.stripe_price_id as string] || "starter";

  // ── Lead upsert (best-effort) ──────────────────────────────────────
  try {
    await sql`
      INSERT INTO leads (email, name, phone, product_id, is_trial, source)
      VALUES (${emailClean}, ${nameClean}, ${phoneClean}, ${product_id}, ${!skip_trial}, 'signup_v2')
      ON CONFLICT (email) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, leads.name),
        phone = COALESCE(EXCLUDED.phone, leads.phone),
        product_id = EXCLUDED.product_id,
        is_trial = EXCLUDED.is_trial,
        updated_at = NOW()
    `;
  } catch {
    // Non-fatal — leads table might not exist or have constraints we don't want to block on
  }

  // ── Check for existing subscription for this email ────────────────
  const [existing] = await sql`
    SELECT s.id, s.metadata
    FROM subscriptions s
    JOIN users u ON u.subscription_id = s.id AND u.role = 'owner'
    WHERE u.email = ${emailClean} AND s.is_active = true
    LIMIT 1
  `;

  if (existing) {
    return NextResponse.json({
      error: "An active subscription already exists for this email. Sign in to your dashboard or contact support.",
    }, { status: 409 });
  }

  // ── Stripe customer + subscription ──────────────────────────────────
  let customer;
  let subscription;
  try {
    customer = await stripe.customers.create({
      email: emailClean,
      name: nameClean,
      phone: phoneClean || undefined,
      metadata: { source: "onboarding_v2" },
    });

    subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: product.stripe_price_id as string }],
      trial_period_days: trialDays > 0 ? trialDays : undefined,
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
        payment_method_types: ["card"],
      },
      expand: ["latest_invoice.payment_intent", "pending_setup_intent"],
      metadata: {
        product_id: product_id,
        product_name: product.name as string,
      },
    });
  } catch (err) {
    console.error("Stripe error:", err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Could not initialize billing",
    }, { status: 502 });
  }

  // Determine the intent: SetupIntent for trial, PaymentIntent for direct
  type ExpandedSub = typeof subscription & {
    pending_setup_intent?: { id: string; client_secret: string | null } | string | null;
    latest_invoice?: { payment_intent?: { id: string; client_secret: string | null } | string | null } | string | null;
  };
  const sub = subscription as ExpandedSub;
  let clientSecret: string | null = null;
  let intentType: "setup" | "payment" = "setup";
  if (typeof sub.pending_setup_intent === "object" && sub.pending_setup_intent && sub.pending_setup_intent.client_secret) {
    clientSecret = sub.pending_setup_intent.client_secret;
    intentType = "setup";
  } else {
    const inv = typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
    const pi = inv && typeof inv.payment_intent === "object" ? inv.payment_intent : null;
    if (pi && pi.client_secret) {
      clientSecret = pi.client_secret;
      intentType = "payment";
    }
  }
  if (!clientSecret) {
    return NextResponse.json({ error: "Could not initialize payment intent" }, { status: 502 });
  }

  // ── DB subscription + owner user ────────────────────────────────────
  const apiKeyRaw = `tp_${randomBytes(24).toString("hex")}`;
  const apiKeyHash = createHash("sha256").update(apiKeyRaw).digest("hex");

  // Auto-flag test subscriptions: any signup with an @tracpost.com email
  // (catch-all the operator uses for synthetic test accounts).
  const isTest = emailClean.endsWith("@tracpost.com");

  const [dbSub] = await sql`
    INSERT INTO subscriptions (api_key_hash, plan, is_active, is_test, metadata)
    VALUES (
      ${apiKeyHash},
      ${plan},
      true,
      ${isTest},
      ${JSON.stringify({
        stripe: { customer_id: customer.id, subscription_id: subscription.id },
        api_key_preview: apiKeyRaw.slice(0, 8) + "...",
        onboarding_status: "started",
      })}
    )
    RETURNING id
  `;

  await sql`
    INSERT INTO users (subscription_id, name, email, phone, role, is_active)
    VALUES (
      ${dbSub.id},
      ${nameClean},
      ${emailClean},
      ${phoneClean},
      'owner',
      true
    )
  `;

  // ── Onboarding submission row + token ───────────────────────────────
  const onboarding = await createSubmission(dbSub.id as string);

  return NextResponse.json({
    client_secret: clientSecret,
    intent_type: intentType,
    onboarding_token: onboarding.token,
    subscription_id: dbSub.id,
  });
}
