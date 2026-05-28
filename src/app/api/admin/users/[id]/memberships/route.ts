/**
 * POST   /api/admin/users/[id]/memberships   Body: { scope_type, role, scope_id?, capability? }
 * PATCH  /api/admin/users/[id]/memberships   Body: { membership_id, capability }
 * DELETE /api/admin/users/[id]/memberships?membership_id=...
 *
 * Operator-only management of the v3 membership rows that drive auth.
 *  - platform / operator scopes are global (scope_id forced null)
 *  - account / business scopes require a valid scope_id
 *  - capability (full|capture|reviewer) is the function axis, business scope only
 * Unique indexes prevent duplicate (user, scope_type, scope_id) rows.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";

const SCOPE_TYPES = ["platform", "operator", "account", "business"] as const;
const ROLES = ["admin", "member"] as const;
type ScopeType = (typeof SCOPE_TYPES)[number];
type Role = (typeof ROLES)[number];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req.cookies.get("tp_admin")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const scopeType = body.scope_type as ScopeType;
  const role = body.role as Role;
  let scopeId = (body.scope_id as string | null) ?? null;

  if (!SCOPE_TYPES.includes(scopeType)) {
    return NextResponse.json({ error: "Invalid scope_type" }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const [user] = await sql`SELECT id FROM users WHERE id = ${id}`;
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let scopeName: string | null = null;
  if (scopeType === "platform" || scopeType === "operator") {
    scopeId = null; // global scopes carry no target
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

  // capability (function axis) — only meaningful at business scope
  let capability: string | null = null;
  if (scopeType === "business") {
    const c = (body.capability as string | undefined) || "full";
    if (!["full", "capture", "reviewer"].includes(c)) {
      return NextResponse.json({ error: "Invalid capability" }, { status: 400 });
    }
    capability = c;
  }

  const [row] = await sql`
    INSERT INTO memberships (user_id, scope_type, scope_id, role, capability)
    VALUES (${id}, ${scopeType}, ${scopeId}, ${role}, ${capability})
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  if (!row) {
    return NextResponse.json(
      { error: "A membership for this scope already exists" },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    membership: {
      id: row.id as string,
      scope_type: scopeType,
      role,
      capability,
      scope_id: scopeId,
      scope_name: scopeName,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req.cookies.get("tp_admin")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const membershipId = body.membership_id as string | undefined;
  const capability = body.capability as string | undefined;

  if (!membershipId) {
    return NextResponse.json({ error: "membership_id required" }, { status: 400 });
  }
  if (!capability || !["full", "capture", "reviewer"].includes(capability)) {
    return NextResponse.json({ error: "Invalid capability" }, { status: 400 });
  }

  const [m] = await sql`
    SELECT id, scope_type FROM memberships WHERE id = ${membershipId} AND user_id = ${id}
  `;
  if (!m) return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  if (m.scope_type !== "business") {
    return NextResponse.json(
      { error: "Capability only applies to business memberships" },
      { status: 400 },
    );
  }

  await sql`UPDATE memberships SET capability = ${capability} WHERE id = ${membershipId} AND user_id = ${id}`;
  return NextResponse.json({ ok: true, capability });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req.cookies.get("tp_admin")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const membershipId = new URL(req.url).searchParams.get("membership_id");
  if (!membershipId) {
    return NextResponse.json({ error: "membership_id required" }, { status: 400 });
  }

  await sql`DELETE FROM memberships WHERE id = ${membershipId} AND user_id = ${id}`;
  return NextResponse.json({ ok: true });
}
