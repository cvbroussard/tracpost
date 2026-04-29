/**
 * Shared STOP/UNSTOP/HELP handler — called by each provider-specific
 * webhook with the parsed phone number + body. Writes the appropriate
 * consent row and returns a confirmation message the provider should
 * relay back to the recipient (per carrier requirements).
 */
import "server-only";
import { findSubscriptionByPhone, recordConsent } from "./comms-consent";

const STOP_KEYWORDS = ["stop", "unsubscribe", "cancel", "end", "quit", "stopall"];
const START_KEYWORDS = ["start", "unstop", "yes"];
const HELP_KEYWORDS = ["help", "info"];

export interface StopHandlerInput {
  fromPhone: string;
  body: string;
  provider: string;
}

export interface StopHandlerResult {
  intent: "stop" | "start" | "help" | "unknown";
  reply: string;
  consent_recorded: boolean;
}

const STOP_REPLY =
  "TracPost: You're unsubscribed and will receive no further messages. Reply START to re-subscribe.";
const START_REPLY =
  "TracPost: You're re-subscribed. Reply STOP to opt out at any time. Msg & data rates may apply.";
const HELP_REPLY =
  "TracPost: For help reply HELP, to opt out reply STOP. Support: support@tracpost.com. Msg & data rates may apply.";

export async function handleSmsInbound(
  input: StopHandlerInput
): Promise<StopHandlerResult> {
  const trimmed = input.body.trim().toLowerCase();
  const intent = classifyIntent(trimmed);

  if (intent === "stop") {
    const sub = await findSubscriptionByPhone(input.fromPhone);
    if (sub) {
      await recordConsent({
        subscriptionId: sub.subscription_id,
        userId: sub.user_id,
        channel: "sms",
        consentType: "transactional",
        action: "opt_out",
        source: "sms_reply_stop",
        consentText: input.body.slice(0, 500),
        phoneNumber: input.fromPhone,
        metadata: { provider: input.provider, raw_body: input.body },
      });
      return { intent, reply: STOP_REPLY, consent_recorded: true };
    }
    return { intent, reply: STOP_REPLY, consent_recorded: false };
  }

  if (intent === "start") {
    const sub = await findSubscriptionByPhone(input.fromPhone);
    if (sub) {
      await recordConsent({
        subscriptionId: sub.subscription_id,
        userId: sub.user_id,
        channel: "sms",
        consentType: "transactional",
        action: "opt_in",
        source: "sms_reply_start",
        consentText: input.body.slice(0, 500),
        phoneNumber: input.fromPhone,
        metadata: { provider: input.provider, raw_body: input.body },
      });
      return { intent, reply: START_REPLY, consent_recorded: true };
    }
    return { intent, reply: START_REPLY, consent_recorded: false };
  }

  if (intent === "help") {
    return { intent, reply: HELP_REPLY, consent_recorded: false };
  }

  return { intent, reply: "", consent_recorded: false };
}

function classifyIntent(body: string): "stop" | "start" | "help" | "unknown" {
  const first = body.split(/\s+/)[0] || "";
  if (STOP_KEYWORDS.includes(first)) return "stop";
  if (START_KEYWORDS.includes(first)) return "start";
  if (HELP_KEYWORDS.includes(first)) return "help";
  return "unknown";
}
