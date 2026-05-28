import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { detectContentGaps } from "@/lib/blog/content-gaps";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const [sub] = await sql`
    SELECT active_site_id FROM accounts WHERE id = ${auth.subscriptionId}
  `;
  if (!sub?.active_site_id) {
    return NextResponse.json({ gaps: [] });
  }

  const gaps = await detectContentGaps(sub.active_site_id as string);
  return NextResponse.json({ gaps });
}
