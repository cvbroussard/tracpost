/**
 * sendSms() — provider-agnostic SMS dispatcher.
 *
 * The active provider is selected by env var SMS_PROVIDER. All four
 * providers (twilio, aws_sns, bandwidth, telnyx) have submitted 10DLC
 * A2P registration in parallel. Whichever approves first gets pointed
 * at via this env var.
 *
 * Until a provider is approved, sendSms() throws SmsNotEnabledError so
 * callers can fall back gracefully (e.g., switch to email-only delivery
 * for that notification).
 *
 * All sends are gated by recordConsent state — pulls current consent
 * for the (subscription, sms, transactional) tuple and refuses to send
 * if opt_out is current.
 *
 * Use cases (locked, no marketing SMS ever):
 *   - 'negative_review_alert' — urgent customer-facing alert
 *   - 'account_critical' — billing failure, suspension warning
 *   - 'magic_otp' — sign-in / step-up confirmation code
 *   - 'operator_nudge_urgent' — operator-flagged urgent help message
 */
import "server-only";
import { getCurrentConsent } from "./comms-consent";

export type SmsUseCase =
  | "negative_review_alert"
  | "account_critical"
  | "magic_otp"
  | "operator_nudge_urgent";

export class SmsNotEnabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsNotEnabledError";
  }
}

export class SmsConsentMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsConsentMissingError";
  }
}

export interface SendSmsInput {
  to: string;
  body: string;
  useCase: SmsUseCase;
  /**
   * Subscription that owns this phone number — required for consent verification.
   */
  subscriptionId: string;
  userId?: string;
}

export interface SendSmsResult {
  delivered: boolean;
  provider: string;
  providerMessageId?: string;
  error?: string;
}

const COMPLIANCE_FOOTER = " Reply STOP to opt out, HELP for help. Msg & data rates may apply.";

interface SmsProvider {
  name: string;
  send(to: string, body: string): Promise<SendSmsResult>;
}

const providers: Record<string, SmsProvider> = {
  twilio: {
    name: "twilio",
    async send() {
      throw new SmsNotEnabledError(
        "Twilio SMS not yet enabled — 10DLC A2P registration pending."
      );
    },
  },
  aws_sns: {
    name: "aws_sns",
    async send() {
      throw new SmsNotEnabledError(
        "AWS SNS SMS not yet enabled — 10DLC A2P registration pending."
      );
    },
  },
  bandwidth: {
    name: "bandwidth",
    async send() {
      throw new SmsNotEnabledError(
        "Bandwidth SMS not yet enabled — 10DLC A2P registration pending."
      );
    },
  },
  telnyx: {
    name: "telnyx",
    async send() {
      throw new SmsNotEnabledError(
        "Telnyx SMS not yet enabled — 10DLC A2P registration pending."
      );
    },
  },
};

function activeProvider(): SmsProvider {
  const key = (process.env.SMS_PROVIDER || "").toLowerCase();
  if (!key) {
    throw new SmsNotEnabledError(
      "No SMS provider selected — set SMS_PROVIDER env var to one of: twilio, aws_sns, bandwidth, telnyx."
    );
  }
  const provider = providers[key];
  if (!provider) {
    throw new SmsNotEnabledError(
      `Unknown SMS provider "${key}". Allowed: twilio, aws_sns, bandwidth, telnyx.`
    );
  }
  return provider;
}

/**
 * Send an SMS. Verifies consent first; appends compliance footer; routes
 * through the env-selected provider.
 */
export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const consent = await getCurrentConsent(input.subscriptionId, "sms", "transactional");
  if (consent !== "opt_in") {
    throw new SmsConsentMissingError(
      `Cannot send SMS to subscription ${input.subscriptionId}: current consent is ${consent}.`
    );
  }

  const provider = activeProvider();

  // Append compliance footer if not already present (templates should
  // include their own STOP reminder, but we ensure it's there as a
  // safety net for first messages especially).
  const needsFooter = !/STOP|opt out/i.test(input.body);
  const finalBody = needsFooter ? `${input.body}${COMPLIANCE_FOOTER}` : input.body;

  return provider.send(input.to, finalBody);
}

/**
 * Whether SMS is currently usable (used by callers to decide between
 * SMS and email-only delivery for notifications).
 */
export function isSmsEnabled(): boolean {
  const key = (process.env.SMS_PROVIDER || "").toLowerCase();
  return key in providers;
}
