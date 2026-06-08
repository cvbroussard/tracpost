/**
 * Account suspension governance endpoint.
 *
 * GET  /api/admin/accounts/[id]/suspension
 *   Returns current suspension state for the billing account.
 *
 * POST /api/admin/accounts/[id]/suspension
 *   Body: { action: "suspend" | "unsuspend", reason?: string }
 *   Suspends or restores the billing account. Sets `accounts.is_active`,
 *   `accounts.status`, `accounts.suspended_at`, `accounts.suspend_reason`
 *   in tandem so all downstream gates (auth, billing, publishing) read
 *   consistent state.
 *
 * Lives separate from /billing on purpose — suspension is governance,
 * not a billing-cycle action. The two surfaces co-locate inside the
 * provisioning drawer's checkout task (per [[provisioning-drawer-console]])
 * but their API contracts stay distinct.
 *
 * Operator-only. No subscriber-side equivalent exists or should — a
 * subscriber cannot suspend their own account (use /api/account/cancel
 * for subscriber-initiated cancellation).
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ subscriptionId: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { subscriptionId: id } = await params;
  const [row] = await sql`
    SELECT is_active, status, suspended_at, suspend_reason
    FROM accounts WHERE id = ${id} LIMIT 1
  `;
  if (!row) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({
    isActive: row.is_active,
    status: row.status,
    suspendedAt: row.suspended_at,
    suspendReason: row.suspend_reason,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ subscriptionId: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { subscriptionId: id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action as string | undefined;
  const reason = (body.reason as string | undefined)?.trim() || null;

  if (action !== "suspend" && action !== "unsuspend") {
    return NextResponse.json(
      { error: "action must be 'suspend' or 'unsuspend'" },
      { status: 400 },
    );
  }

  if (action === "suspend") {
    await sql`
      UPDATE accounts
      SET is_active = false,
          status = 'suspended',
          suspended_at = NOW(),
          suspend_reason = ${reason},
          updated_at = NOW()
      WHERE id = ${id}
    `;
    return NextResponse.json({ success: true, status: "suspended" });
  }

  // unsuspend — clear suspension fields, flip back to active
  await sql`
    UPDATE accounts
    SET is_active = true,
        status = 'active',
        suspended_at = NULL,
        suspend_reason = NULL,
        updated_at = NOW()
    WHERE id = ${id}
  `;
  return NextResponse.json({ success: true, status: "active" });
}
