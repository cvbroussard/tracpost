/**
 * POST /api/sms/webhook/twilio
 *
 * Twilio inbound SMS webhook. Twilio posts URL-encoded form data with
 * From, Body, and other fields. We parse, route through the shared
 * STOP/START/HELP handler, and respond with TwiML so Twilio relays the
 * appropriate carrier-mandated reply.
 *
 * Stub: handler is wired but the route is inert until Twilio is the
 * SMS_PROVIDER. Approval-pending state means no inbound messages should
 * arrive yet.
 */
import { NextRequest, NextResponse } from "next/server";
import { handleSmsInbound } from "@/lib/sms-stop-handler";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const from = (formData.get("From") as string) || "";
  const body = (formData.get("Body") as string) || "";

  const result = await handleSmsInbound({
    fromPhone: from,
    body,
    provider: "twilio",
  });

  // Respond with TwiML so Twilio sends the reply automatically
  const twiml = result.reply
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(result.reply)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
