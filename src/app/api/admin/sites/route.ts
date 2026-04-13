import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/admin/sites — Create a site for any subscriber (admin only).
 * No auth gate yet — Phase 1 bootstrap.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subscription_id, name, domain, blog_url } = body;

    if (!subscription_id || !name) {
      return NextResponse.json(
        { error: "subscription_id and name are required" },
        { status: 400 }
      );
    }

    const rows = await sql`
      INSERT INTO sites (subscription_id, name, domain, blog_url, url, provisioning_status)
      VALUES (
        ${subscription_id}, ${name},
        ${domain || null}, ${blog_url || null},
        ${domain ? `https://${domain}` : null},
        'requested'
      )
      RETURNING id, subscription_id, name, domain, blog_url, url, provisioning_status, created_at
    `;

    return NextResponse.json({ site: rows[0] }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
