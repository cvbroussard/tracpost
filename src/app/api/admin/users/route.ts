/**
 * POST /api/admin/users
 * Body: { email, name?, password }
 *
 * Operator-only. Creates an ACCOUNTLESS staff user (billing_account_id NULL) —
 * intended for platform/operator staff (e.g. the super admin). Customer team
 * members are created via the onboarding / account-team flows, not here.
 *
 * Does NOT grant memberships — membership/access is assigned strictly via the
 * user card (POST /api/admin/users/[id]/memberships). The new user starts with
 * zero memberships (a Guest until granted).
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  if (!await isAdminRequest()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const email = (body.email as string | undefined)?.trim().toLowerCase();
  const name = ((body.name as string | undefined)?.trim() || email) ?? null; // users.name is NOT NULL
  const password = body.password as string | undefined;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const [existing] = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing) {
    return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Accountless staff user. Authority is the membership granted afterward;
  // the legacy users.role column is no longer written.
  const [user] = await sql`
    INSERT INTO users (email, name, password_hash, is_active, billing_account_id)
    VALUES (${email}, ${name}, ${passwordHash}, true, NULL)
    RETURNING id, name, email, is_active, billing_account_id, created_at
  `;

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      name: (user.name as string) ?? null,
      email: user.email,
      isActive: user.is_active !== false,
      createdAt: String(user.created_at),
      billingAccountId: (user.billing_account_id as string) ?? null,
      accountName: null,
      memberships: [],
      accountBusinesses: [],
    },
  });
}
