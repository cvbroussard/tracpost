import { sql } from "@/lib/db";
import { hashApiKey } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

/**
 * POST /api/subscribers — Create a new subscription + owner user + API key.
 * Internal/admin only (no auth gate yet — Phase 1 bootstrap).
 *
 * Body: { name, plan?, email?, password? }
 * - email + password enable dashboard login (stored on the owner user row)
 * - API key is always generated for programmatic API access
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, plan, email, password } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    // Generate a random API key
    const apiKey = `tp_${randomBytes(24).toString("hex")}`;
    const apiKeyHash = await hashApiKey(apiKey);

    // Hash password if provided
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    // Create subscription (billing entity)
    const [subscription] = await sql`
      INSERT INTO subscriptions (api_key_hash, plan, is_active)
      VALUES (${apiKeyHash}, ${plan || "free"}, true)
      RETURNING id, plan, created_at
    `;

    // Create owner user
    await sql`
      INSERT INTO users (subscription_id, name, email, password_hash, role, is_active)
      VALUES (${subscription.id}, ${name}, ${email || null}, ${passwordHash}, 'owner', true)
    `;

    return NextResponse.json({
      subscriber: { ...subscription, name },
      api_key: apiKey, // Only shown once at creation — for programmatic API access
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/subscribers — List all subscriptions with their owner user info.
 * Internal/admin only.
 */
export async function GET() {
  try {
    const rows = await sql`
      SELECT s.id, s.plan, s.is_active, s.created_at, s.updated_at,
             COALESCE(owner.name, owner.email, '—') AS name
      FROM subscriptions s
      LEFT JOIN users owner ON owner.subscription_id = s.id AND owner.role = 'owner'
      ORDER BY s.created_at DESC
    `;
    return NextResponse.json({ subscribers: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
