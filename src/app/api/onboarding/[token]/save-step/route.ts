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
import { sql } from "@/lib/db";
import { recordConsent, getCurrentConsent } from "@/lib/comms-consent";

export async function POST(
  req: NextRequest,
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

  // Step 6 is the comms-preferences step. Record SMS consent state
  // changes here with full audit fields. Email transactional consent
  // is implicit (welcome email, etc.) and doesn't need a per-step record.
  if (step === 6 && typeof data === "object" && data !== null) {
    const stepData = data as Record<string, unknown>;
    const notifyVia = stepData.notify_via as string | undefined;
    const phone = stepData.owner_phone as string | undefined;
    const consentText = stepData.sms_consent_text as string | undefined;

    if (notifyVia) {
      const wantsSms = notifyVia === "both";
      const [owner] = await sql`
        SELECT id FROM users
        WHERE subscription_id = ${updated.subscription_id} AND role = 'owner'
        LIMIT 1
      `;

      const current = await getCurrentConsent(updated.subscription_id, "sms", "transactional");
      const desired = wantsSms ? "opt_in" : "opt_out";

      if (current !== desired) {
        try {
          await recordConsent({
            subscriptionId: updated.subscription_id,
            userId: (owner?.id as string) || null,
            channel: "sms",
            consentType: "transactional",
            action: desired,
            source: "onboarding_step_6",
            consentText:
              consentText ||
              (wantsSms
                ? "I agree to receive transactional SMS messages from TracPost about my account, urgent customer engagement (e.g., negative reviews), and security codes. Msg & data rates may apply. Reply STOP to opt out at any time."
                : "Opted out of SMS during onboarding."),
            phoneNumber: phone || null,
            ipAddress:
              req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
              req.headers.get("x-real-ip") ||
              null,
            userAgent: req.headers.get("user-agent") || null,
          });
        } catch (err) {
          console.error("comms_consent record failed (non-fatal):", err);
        }
      }
    }
  }

  return NextResponse.json({
    current_step: updated.current_step,
    data: updated.data,
    platform_status: updated.platform_status,
  });
}
