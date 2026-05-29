import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { createAccount } from "@/lib/accounts";
import { isAdminRequest } from "@/lib/admin-session";

/**
 * POST /api/admin/accounts — Create a new subscription + owner user + API key.
 * Internal/admin only (no auth gate yet — Phase 1 bootstrap).
 *
 * Body: { name, plan?, email?, password? }
 * - email + password enable dashboard login (stored on the owner user row)
 * - API key is always generated for programmatic API access
 */
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { name, plan, email, password } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    // Single source of truth: creates a direct account + owner user + the
    // account-scope admin (owner) membership in one transaction. The
    // new-account UI (#35) will add the type/parent pickers; the admin create
    // mints a direct account for now.
    const { accountId, apiKey } = await createAccount({
      type: "direct",
      plan: plan || "free",
      name,
      owner: { name, email: email || null, password: password || null },
    });

    return NextResponse.json({
      subscriber: { id: accountId, plan: plan || "free", name },
      api_key: apiKey, // Only shown once at creation — for programmatic API access
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/admin/accounts — List all subscriptions with their owner user info.
 * Internal/admin only.
 */
export async function GET() {
  try {
    const rows = await sql`
      SELECT s.id, s.plan, s.is_active, s.created_at, s.updated_at,
             COALESCE(owner.name, owner.email, '—') AS name
      FROM accounts s
      LEFT JOIN users owner ON owner.id = s.owner_user_id
      ORDER BY s.created_at DESC
    `;
    return NextResponse.json({ subscribers: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
