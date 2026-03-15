import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/sites — Create a site under the authenticated subscriber.
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const body = await req.json();
    const { name, domain, blog_url, url, external_id, brand_voice } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const rows = await sql`
      INSERT INTO sites (subscriber_id, name, domain, blog_url, url, external_id, brand_voice)
      VALUES (
        ${auth.subscriberId}, ${name},
        ${domain || null}, ${blog_url || null},
        ${url || (domain ? `https://${domain}` : null)},
        ${external_id || null}, ${JSON.stringify(brand_voice || {})}
      )
      RETURNING id, subscriber_id, name, domain, blog_url, url, external_id, brand_voice, created_at
    `;

    return NextResponse.json({ site: rows[0] }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/sites — List all sites for the authenticated subscriber.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const rows = await sql`
      SELECT id, name, url, external_id, brand_voice, metadata, created_at, updated_at
      FROM sites
      WHERE subscriber_id = ${auth.subscriberId}
      ORDER BY created_at DESC
    `;
    return NextResponse.json({ sites: rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
