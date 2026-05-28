import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { generateMagicToken } from "@/lib/magic-link";

export const runtime = "nodejs";

/**
 * POST /api/account/team/:id/magic-link — Generate a magic link for a team member
 * Returns the full URL for QR code display.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  if (auth.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  // Verify user belongs to this subscription
  const [member] = await sql`
    SELECT id FROM users
    WHERE id = ${id} AND billing_account_id = ${auth.subscriptionId} AND is_active = true
  `;
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const token = await generateMagicToken(id);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.NODE_ENV === "production" ? "https://studio.tracpost.com" : "http://localhost:3000");
  const magicUrl = `${baseUrl}/auth/magic?token=${token}`;

  return NextResponse.json({ url: magicUrl });
}
