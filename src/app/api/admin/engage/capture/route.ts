/**
 * POST /api/admin/engage/capture
 * Triggers an immediate engagement capture across all healthy assets.
 * Returns the same summary the cron does.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";

export async function POST(req: NextRequest) {
  if (!await isAdminRequest()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { captureAllEngagements } = await import("@/lib/engage/capture");
  const summary = await captureAllEngagements();
  return NextResponse.json({ summary });
}
