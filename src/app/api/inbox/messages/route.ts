import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";

/**
 * GET /api/inbox/messages
 *
 * Phase 3 placeholder — returns empty.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  return NextResponse.json({ conversations: [], message: "Coming soon" });
}
