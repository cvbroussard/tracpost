/**
 * POST /api/sms/webhook/telnyx
 *
 * Telnyx posts inbound message events as JSON. Schema:
 *   { data: { event_type, payload: { from: { phone_number }, text } } }
 *
 * Stub: wired but inert until Telnyx is the SMS_PROVIDER.
 */
import { NextRequest, NextResponse } from "next/server";
import { handleSmsInbound } from "@/lib/sms-stop-handler";

interface TelnyxEvent {
  data?: {
    event_type?: string;
    payload?: {
      from?: { phone_number?: string };
      text?: string;
    };
  };
}

export async function POST(req: NextRequest) {
  const event = (await req.json().catch(() => ({}))) as TelnyxEvent;

  if (event.data?.event_type !== "message.received") {
    return NextResponse.json({ ignored: true });
  }

  const from = event.data?.payload?.from?.phone_number || "";
  const text = event.data?.payload?.text || "";

  const result = await handleSmsInbound({
    fromPhone: from,
    body: text,
    provider: "telnyx",
  });

  // Telnyx requires a separate API call to reply. Wire that when going
  // live; for now, return the intended reply.
  return NextResponse.json({
    intent: result.intent,
    reply: result.reply,
    consent_recorded: result.consent_recorded,
  });
}
