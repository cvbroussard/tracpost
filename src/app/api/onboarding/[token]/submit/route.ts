/**
 * POST /api/onboarding/[token]/submit
 *
 * Marks the submission as complete from the subscriber's side
 * (submitted_at = NOW()). Operator picks up from here in the queue
 * (Phase 6) — does provisioning work, then clicks "Send welcome email"
 * which marks completed_at and triggers the studio handoff.
 *
 * Future: kick off email notification to the operator that a new
 * submission landed. For now, just marks the row.
 */
import { NextRequest, NextResponse } from "next/server";
import { getByToken, isExpired, markSubmitted } from "@/lib/onboarding/queries";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const submission = await getByToken(token);
  if (!submission) {
    return NextResponse.json({ error: "Onboarding link not found" }, { status: 404 });
  }
  if (isExpired(submission)) {
    return NextResponse.json({ error: "Onboarding link expired" }, { status: 410 });
  }
  if (submission.submitted_at) {
    return NextResponse.json({ error: "Already submitted" }, { status: 409 });
  }

  // Minimum data sanity check — must have business_name + owner_email at least
  const data = submission.data as Record<string, unknown>;
  if (!data.business_name || !data.owner_email) {
    return NextResponse.json({
      error: "Form is missing required fields. Please complete all steps first.",
    }, { status: 400 });
  }

  const updated = await markSubmitted(token);
  if (!updated) {
    return NextResponse.json({ error: "Failed to submit" }, { status: 500 });
  }

  // TODO Phase 6: notify operator queue (email/Slack/in-app)

  return NextResponse.json({ success: true, submitted_at: updated.submitted_at });
}
