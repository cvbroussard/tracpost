import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * POST /api/account/onboarding
 * Update onboarding status in subscriber metadata.
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const { status } = await req.json();

  await sql`
    UPDATE subscribers
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{onboarding_status}',
      ${JSON.stringify(status)}::jsonb
    ),
    updated_at = NOW()
    WHERE id = ${auth.subscriberId}
  `;

  return NextResponse.json({ ok: true });
}
