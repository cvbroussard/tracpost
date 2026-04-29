/**
 * POST /api/sms/webhook/bandwidth
 *
 * Bandwidth posts inbound message events as JSON arrays. Each event has
 * type 'message-received' with the message details under .message.
 *
 * Stub: wired but inert until Bandwidth is the SMS_PROVIDER.
 */
import { NextRequest, NextResponse } from "next/server";
import { handleSmsInbound } from "@/lib/sms-stop-handler";

interface BandwidthEvent {
  type?: string;
  message?: {
    from?: string;
    text?: string;
  };
}

export async function POST(req: NextRequest) {
  const events = (await req.json().catch(() => [])) as BandwidthEvent[];
  if (!Array.isArray(events)) {
    return NextResponse.json({ error: "expected array of events" }, { status: 400 });
  }

  const replies: Array<{ to: string; reply: string }> = [];
  for (const event of events) {
    if (event.type !== "message-received" || !event.message) continue;

    const from = event.message.from || "";
    const text = event.message.text || "";

    const result = await handleSmsInbound({
      fromPhone: from,
      body: text,
      provider: "bandwidth",
    });

    if (result.reply && from) {
      replies.push({ to: from, reply: result.reply });
    }
  }

  // Bandwidth requires us to send replies via separate API call (not via
  // webhook response). When we go live, this loop would call the
  // Bandwidth send-message API. For the stub, just return the intended
  // replies so they can be inspected in dev.
  return NextResponse.json({ replies });
}
