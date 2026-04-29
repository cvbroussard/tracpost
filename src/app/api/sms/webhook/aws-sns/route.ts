/**
 * POST /api/sms/webhook/aws-sns
 *
 * AWS SNS forwards inbound SMS via an SNS topic delivering JSON payloads.
 * Subscribed via either HTTP/S endpoint or Lambda. We accept the JSON
 * payload directly here.
 *
 * Stub: wired but inert until AWS SNS is the SMS_PROVIDER.
 */
import { NextRequest, NextResponse } from "next/server";
import { handleSmsInbound } from "@/lib/sms-stop-handler";

interface SnsMessagePayload {
  originationNumber?: string;
  messageBody?: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // SNS HTTP confirmation flow (one-time when subscribing the endpoint)
  if (body.Type === "SubscriptionConfirmation" && body.SubscribeURL) {
    try {
      await fetch(body.SubscribeURL);
    } catch {
      /* non-fatal */
    }
    return NextResponse.json({ confirmed: true });
  }

  // Notification — payload is in body.Message (stringified JSON)
  let payload: SnsMessagePayload = {};
  if (typeof body.Message === "string") {
    try {
      payload = JSON.parse(body.Message);
    } catch {
      return NextResponse.json({ error: "invalid SNS message payload" }, { status: 400 });
    }
  } else {
    payload = body as SnsMessagePayload;
  }

  const from = payload.originationNumber || "";
  const text = payload.messageBody || "";

  const result = await handleSmsInbound({
    fromPhone: from,
    body: text,
    provider: "aws_sns",
  });

  // AWS SNS doesn't auto-reply from the webhook response. The reply
  // would need to be sent via a separate SNS Publish call. Stubbed for
  // now — return the intended reply in the JSON response so it can be
  // hand-tested or wired to a Lambda later.
  return NextResponse.json({
    intent: result.intent,
    reply: result.reply,
    consent_recorded: result.consent_recorded,
  });
}
