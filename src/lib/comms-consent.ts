/**
 * comms_consent — append-only consent record.
 *
 * recordConsent() inserts a new audit row. Always succeeds (or throws);
 * never updates an existing row.
 *
 * getCurrentConsent() computes the current opt-in/out state by reading
 * the latest row per (subscription_id, channel, consent_type). Default
 * is opt_out unless an opt_in row is more recent.
 */
import "server-only";
import { sql } from "./db";

export type Channel = "sms" | "email";
export type ConsentType = "transactional" | "marketing";
export type ConsentAction = "opt_in" | "opt_out";
export type ConsentSource =
  | "onboarding_step_6"
  | "settings_page"
  | "sms_reply_stop"
  | "sms_reply_start"
  | "operator"
  | "support_request";

export interface RecordConsentInput {
  subscriptionId: string;
  userId?: string | null;
  channel: Channel;
  consentType: ConsentType;
  action: ConsentAction;
  source: ConsentSource;
  consentText: string;
  phoneNumber?: string | null;
  emailAddress?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append a consent row. Returns the new row's id.
 */
export async function recordConsent(input: RecordConsentInput): Promise<string> {
  const [row] = await sql`
    INSERT INTO comms_consent (
      subscription_id, user_id, channel, consent_type, action, source,
      consent_text, phone_number, email_address, ip_address, user_agent, metadata
    ) VALUES (
      ${input.subscriptionId},
      ${input.userId || null},
      ${input.channel},
      ${input.consentType},
      ${input.action},
      ${input.source},
      ${input.consentText},
      ${input.phoneNumber || null},
      ${input.emailAddress || null},
      ${input.ipAddress || null},
      ${input.userAgent || null},
      ${JSON.stringify(input.metadata || {})}::jsonb
    )
    RETURNING id
  `;
  return row.id as string;
}

/**
 * Read the current consent state for a subscription on a channel+type.
 * Returns 'opt_in' only if the latest row for that combo is opt_in;
 * defaults to 'opt_out' if no rows exist or the latest is opt_out.
 */
export async function getCurrentConsent(
  subscriptionId: string,
  channel: Channel,
  consentType: ConsentType
): Promise<ConsentAction> {
  const [latest] = await sql`
    SELECT action
    FROM comms_consent
    WHERE subscription_id = ${subscriptionId}
      AND channel = ${channel}
      AND consent_type = ${consentType}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return (latest?.action as ConsentAction) || "opt_out";
}

/**
 * Bulk read: returns a map of channel+type → current action for one
 * subscription. Used for rendering the settings page.
 */
export async function getConsentSnapshot(
  subscriptionId: string
): Promise<Record<string, ConsentAction>> {
  const rows = await sql`
    SELECT DISTINCT ON (channel, consent_type)
      channel, consent_type, action
    FROM comms_consent
    WHERE subscription_id = ${subscriptionId}
    ORDER BY channel, consent_type, created_at DESC
  `;
  const snapshot: Record<string, ConsentAction> = {};
  for (const r of rows) {
    snapshot[`${r.channel}_${r.consent_type}`] = r.action as ConsentAction;
  }
  return snapshot;
}

/**
 * Look up consent by phone number — used by SMS provider STOP webhooks
 * to find which subscription/user just opted out.
 */
export async function findSubscriptionByPhone(
  phoneNumber: string
): Promise<{ subscription_id: string; user_id: string | null } | null> {
  // Prefer the latest consent row that has this phone associated; fall
  // back to the users.phone column.
  const [fromConsent] = await sql`
    SELECT subscription_id, user_id
    FROM comms_consent
    WHERE phone_number = ${phoneNumber}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (fromConsent) {
    return {
      subscription_id: fromConsent.subscription_id as string,
      user_id: (fromConsent.user_id as string) || null,
    };
  }

  const [fromUsers] = await sql`
    SELECT subscription_id, id AS user_id
    FROM users
    WHERE phone = ${phoneNumber} AND is_active = true
    LIMIT 1
  `;
  if (fromUsers) {
    return {
      subscription_id: fromUsers.subscription_id as string,
      user_id: fromUsers.user_id as string,
    };
  }
  return null;
}
