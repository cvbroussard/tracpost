/**
 * GET /api/onboarding/[token]/nudges
 *
 * Token-authorized read of operator-sent nudges for the subscription
 * tied to this onboarding token. Used by the wizard to surface help
 * messages while the subscriber is mid-onboarding (before they have
 * studio access where the existing notification bell would catch it).
 *
 * Returns active (non-dismissed) nudges only. Optional `?platform=xxx`
 * filter for contextual placement next to the matching platform card.
 *
 * POST /api/onboarding/[token]/nudges/dismiss
 * Body: { notification_id }
 * Marks a nudge dismissed so the wizard doesn't keep showing it.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getByToken } from "@/lib/onboarding/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const platform = new URL(req.url).searchParams.get("platform");

  const submission = await getByToken(token);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const rows = platform
    ? await sql`
        SELECT id, title, body, severity, metadata, created_at, read_at
        FROM notifications
        WHERE subscription_id = ${submission.subscription_id}
          AND category = 'onboarding'
          AND dismissed_at IS NULL
          AND (metadata->>'platform') = ${platform}
        ORDER BY created_at DESC
      `
    : await sql`
        SELECT id, title, body, severity, metadata, created_at, read_at
        FROM notifications
        WHERE subscription_id = ${submission.subscription_id}
          AND category = 'onboarding'
          AND dismissed_at IS NULL
        ORDER BY created_at DESC
      `;

  return NextResponse.json({
    nudges: rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      severity: r.severity,
      platform: (r.metadata as Record<string, unknown>)?.platform || null,
      template_key: (r.metadata as Record<string, unknown>)?.template_key || null,
      created_at: r.created_at,
      read_at: r.read_at,
    })),
  });
}
