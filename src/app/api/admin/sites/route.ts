import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/admin/sites — Create a site for any subscriber (admin only).
 * No auth gate yet — Phase 1 bootstrap.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subscriber_id, name, domain, blog_url } = body;

    if (!subscriber_id || !name) {
      return NextResponse.json(
        { error: "subscriber_id and name are required" },
        { status: 400 }
      );
    }

    const rows = await sql`
      INSERT INTO sites (subscriber_id, name, domain, blog_url, url)
      VALUES (
        ${subscriber_id}, ${name},
        ${domain || null}, ${blog_url || null},
        ${domain ? `https://${domain}` : null}
      )
      RETURNING id, subscriber_id, name, domain, blog_url, url, created_at
    `;

    return NextResponse.json({ site: rows[0] }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
