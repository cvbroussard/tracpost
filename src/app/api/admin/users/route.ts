/**
 * POST /api/admin/users
 * Body: { email, name?, password, membership?: { scope_type, role, scope_id? } }
 *
 * Operator-only. Creates an ACCOUNTLESS staff user (billing_account_id NULL) —
 * intended for platform/operator staff (e.g. the super admin). Customer team
 * members are created via the onboarding / account-team flows, not here.
 *
 * Optionally grants an initial membership in the same call (the common case:
 * platform · admin = super admin). The membership is validated BEFORE the user
 * is inserted so a bad grant can't leave an orphaned user.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
import bcrypt from "bcryptjs";

const SCOPE_TYPES = ["platform", "operator", "account", "business"] as const;
const ROLES = ["admin", "member"] as const;
type ScopeType = (typeof SCOPE_TYPES)[number];
type Role = (typeof ROLES)[number];

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req.cookies.get("tp_admin")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const email = (body.email as string | undefined)?.trim().toLowerCase();
  const name = ((body.name as string | undefined)?.trim() || email) ?? null; // users.name is NOT NULL
  const password = body.password as string | undefined;
  const membership = body.membership as
    | { scope_type?: string; role?: string; scope_id?: string | null }
    | undefined;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // Validate the optional membership up front (reads only) so we never create a
  // user we then can't grant.
  let resolved: { scopeType: ScopeType; role: Role; scopeId: string | null; scopeName: string | null } | null = null;
  if (membership && membership.scope_type) {
    const scopeType = membership.scope_type as ScopeType;
    const mRole = membership.role as Role;
    let scopeId = membership.scope_id ?? null;
    let scopeName: string | null = null;

    if (!SCOPE_TYPES.includes(scopeType)) {
      return NextResponse.json({ error: "Invalid membership scope_type" }, { status: 400 });
    }
    if (!ROLES.includes(mRole)) {
      return NextResponse.json({ error: "Invalid membership role" }, { status: 400 });
    }
    if (scopeType === "platform" || scopeType === "operator") {
      scopeId = null;
    } else if (scopeType === "business") {
      if (!scopeId) return NextResponse.json({ error: "scope_id (business) required" }, { status: 400 });
      const [biz] = await sql`SELECT id, name FROM businesses WHERE id = ${scopeId}`;
      if (!biz) return NextResponse.json({ error: "Business not found" }, { status: 400 });
      scopeName = biz.name as string;
    } else if (scopeType === "account") {
      if (!scopeId) return NextResponse.json({ error: "scope_id (account) required" }, { status: 400 });
      const [acct] = await sql`SELECT id, name FROM accounts WHERE id = ${scopeId}`;
      if (!acct) return NextResponse.json({ error: "Account not found" }, { status: 400 });
      scopeName = acct.name as string;
    }
    resolved = { scopeType, role: mRole, scopeId, scopeName };
  }

  const [existing] = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing) {
    return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Accountless staff user. Legacy users.role is vestigial for staff (the
  // membership is the real authority) — default it to 'admin'.
  const [user] = await sql`
    INSERT INTO users (email, name, role, password_hash, is_active, billing_account_id)
    VALUES (${email}, ${name}, 'admin', ${passwordHash}, true, NULL)
    RETURNING id, name, email, role, is_active, billing_account_id, business_id, created_at
  `;

  const memberships: Array<{
    id: string;
    scope_type: ScopeType;
    role: Role;
    capability: string | null;
    scope_id: string | null;
    scope_name: string | null;
  }> = [];
  if (resolved) {
    const [m] = await sql`
      INSERT INTO memberships (user_id, scope_type, scope_id, role)
      VALUES (${user.id}, ${resolved.scopeType}, ${resolved.scopeId}, ${resolved.role})
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (m) {
      memberships.push({
        id: m.id as string,
        scope_type: resolved.scopeType,
        role: resolved.role,
        capability: null, // create-user only grants platform/operator (no capability)
        scope_id: resolved.scopeId,
        scope_name: resolved.scopeName,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      name: (user.name as string) ?? null,
      email: user.email,
      role: (user.role as string) ?? null,
      isActive: user.is_active !== false,
      createdAt: String(user.created_at),
      billingAccountId: (user.billing_account_id as string) ?? null,
      accountName: null,
      businessId: (user.business_id as string) ?? null,
      businessName: null,
      memberships,
      accountBusinesses: [],
    },
  });
}
