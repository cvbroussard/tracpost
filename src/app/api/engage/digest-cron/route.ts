/**
 * GET /api/engage/digest-cron
 * Vercel cron — once daily. Sends an engagement digest to every subscription
 * that had any new (non-archived) engagement events in the past 24h.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendEngagementDigest } from "@/lib/engage/notify";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const subs = await sql`
    SELECT DISTINCT billing_account_id
    FROM engagement_events
    WHERE discovered_at > NOW() - INTERVAL '24 hours'
      AND review_status != 'archived'
  `;

  let sent = 0, skipped = 0, errored = 0;
  for (const s of subs) {
    try {
      const did = await sendEngagementDigest(s.subscription_id as string);
      if (did) sent++;
      else skipped++;
    } catch (err) {
      errored++;
      console.error(`Digest failed for ${s.subscription_id}:`, err);
    }
  }

  return NextResponse.json({
    candidates: subs.length,
    sent,
    skipped,
    errored,
  });
}
