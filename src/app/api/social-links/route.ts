import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * POST /api/social-links
 * Body: { social_account_id, site_id }
 *
 * Link a social account to a site. Both must belong to the authenticated subscriber.
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const { social_account_id, site_id } = await req.json();

  if (!social_account_id || !site_id) {
    return NextResponse.json(
      { error: "social_account_id and site_id are required" },
      { status: 400 }
    );
  }

  // Verify ownership of both
  const [account] = await sql`
    SELECT id FROM social_accounts
    WHERE id = ${social_account_id} AND subscriber_id = ${auth.subscriberId}
  `;
  if (!account) {
    return NextResponse.json({ error: "Social account not found" }, { status: 404 });
  }

  const [site] = await sql`
    SELECT id FROM sites
    WHERE id = ${site_id} AND subscriber_id = ${auth.subscriberId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Create link
  await sql`
    INSERT INTO site_social_links (site_id, social_account_id)
    VALUES (${site_id}, ${social_account_id})
    ON CONFLICT (site_id, social_account_id) DO NOTHING
  `;

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/social-links
 * Body: { social_account_id, site_id }
 *
 * Unlink a social account from a site.
 */
export async function DELETE(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const { social_account_id, site_id } = await req.json();

  if (!social_account_id || !site_id) {
    return NextResponse.json(
      { error: "social_account_id and site_id are required" },
      { status: 400 }
    );
  }

  // Verify ownership
  const [account] = await sql`
    SELECT id FROM social_accounts
    WHERE id = ${social_account_id} AND subscriber_id = ${auth.subscriberId}
  `;
  if (!account) {
    return NextResponse.json({ error: "Social account not found" }, { status: 404 });
  }

  await sql`
    DELETE FROM site_social_links
    WHERE site_id = ${site_id} AND social_account_id = ${social_account_id}
  `;

  return NextResponse.json({ ok: true });
}
