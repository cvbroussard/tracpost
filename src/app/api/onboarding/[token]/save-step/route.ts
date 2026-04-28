/**
 * POST /api/onboarding/[token]/save-step
 * Body: { step: number, data: Record<string, unknown> }
 *
 * Saves form state for one step of the onboarding wizard. Idempotent —
 * safe to call multiple times. data is merged into the JSONB column,
 * so partial updates accumulate without losing prior fields.
 *
 * Returns the updated submission (so the client can sync state).
 * 404 if token invalid or submission already completed.
 */
import { NextRequest, NextResponse } from "next/server";
import { getByToken, saveStep, isExpired } from "@/lib/onboarding/queries";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const submission = await getByToken(token);
  if (!submission) {
    return NextResponse.json({ error: "Onboarding link not found" }, { status: 404 });
  }
  if (await isExpired(submission)) {
    return NextResponse.json({ error: "Onboarding link expired" }, { status: 410 });
  }
  if (submission.completed_at) {
    return NextResponse.json({ error: "Onboarding already submitted" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const step = Number(body.step);
  const data = body.data;

  if (!Number.isInteger(step) || step < 1 || step > 99) {
    return NextResponse.json({ error: "step must be a positive integer" }, { status: 400 });
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return NextResponse.json({ error: "data must be an object" }, { status: 400 });
  }

  const updated = await saveStep(token, step, data);
  if (!updated) {
    return NextResponse.json({ error: "Failed to save step" }, { status: 500 });
  }

  return NextResponse.json({
    current_step: updated.current_step,
    data: updated.data,
    platform_status: updated.platform_status,
  });
}
