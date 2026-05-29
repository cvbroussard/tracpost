/**
 * Engage notifications — push + email delivery for inbound engagement.
 *
 * Two delivery moments:
 *   - notifyNegativeEngagement(): fires immediately when capture inserts a
 *     fresh negative event. Async fire-and-forget; never blocks capture.
 *   - sendEngagementDigest(): once-daily roll-up of all new engagement for
 *     a subscription. Driven by /api/engage/digest-cron.
 */
import "server-only";
import { sql } from "@/lib/db";
import { sendPushNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  gbp: "Google Business",
  linkedin: "LinkedIn",
};

function preferEmail(notifyVia: string | null): boolean {
  return notifyVia !== "push";
}
function preferPush(notifyVia: string | null): boolean {
  return notifyVia !== "email";
}

interface OwnerRow {
  email: string | null;
  notify_via: string | null;
}

async function getOwner(subscriptionId: string): Promise<OwnerRow | null> {
  const [row] = await sql`
    SELECT u.email, u.notify_via
    FROM accounts a
    JOIN users u ON u.id = a.owner_user_id
    WHERE a.id = ${subscriptionId}
      AND u.is_active = true
    LIMIT 1
  `;
  return (row as OwnerRow) || null;
}

/**
 * Fire-and-forget notification for a single new negative engagement event.
 */
export async function notifyNegativeEngagement(input: {
  subscriptionId: string;
  platform: string;
  eventType: string;
  body: string | null;
  personDisplayName: string;
  permalink: string | null;
}): Promise<void> {
  const owner = await getOwner(input.subscriptionId);
  if (!owner) return;

  const platformLabel = PLATFORM_LABEL[input.platform] || input.platform;
  const snippet = input.body ? input.body.slice(0, 140) : "";
  const title = `Negative ${input.eventType} on ${platformLabel}`;
  const summary = `${input.personDisplayName}${snippet ? ` — "${snippet}"` : ""}`;

  // Push (mobile)
  if (preferPush(owner.notify_via)) {
    sendPushNotification(input.subscriptionId, title, summary, {
      type: "engage_negative",
      platform: input.platform,
    }).catch(err => console.error("Engage push failed:", err));
  }

  // Email (only when explicitly negative — daily digest covers everything else)
  if (owner.email && preferEmail(owner.notify_via)) {
    sendEmail({
      to: owner.email,
      subject: title,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px;">
          <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #1a1a1a;">${title}</h2>
          <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">From ${input.personDisplayName}</p>
          ${snippet ? `<blockquote style="font-size: 15px; color: #1a1a1a; line-height: 1.6; padding: 12px 16px; background: #f9fafb; border-left: 3px solid #ef4444; margin: 0 0 24px;">${snippet}</blockquote>` : ""}
          ${input.permalink ? `<p style="margin: 0 0 16px;"><a href="${input.permalink}" style="color: #3b82f6; font-size: 14px;">View on ${platformLabel} →</a></p>` : ""}
          <p style="font-size: 13px; color: #9ca3af; margin-top: 24px;">
            Reply or mark reviewed in your TracPost inbox.
          </p>
        </div>
      `,
    }).catch(err => console.error("Engage email failed:", err));
  }
}

/**
 * Compose and send a per-subscription digest covering the prior 24h.
 * Returns true if a digest was sent (non-empty), false if there was nothing
 * new for this subscriber.
 */
export async function sendEngagementDigest(subscriptionId: string): Promise<boolean> {
  // Pull events captured in last 24h (use discovered_at, not occurred_at —
  // a fresh capture of an old comment still counts as "new to the subscriber")
  const events = await sql`
    SELECT ee.id, ee.platform, ee.event_type, ee.sentiment, ee.body,
           ep.display_name AS person_name
    FROM engagement_events ee
    LEFT JOIN engaged_persons ep ON ep.id = ee.engaged_person_id
    WHERE ee.billing_account_id = ${subscriptionId}
      AND ee.discovered_at > NOW() - INTERVAL '24 hours'
      AND ee.review_status != 'archived'
    ORDER BY ee.occurred_at DESC
  `;
  if (events.length === 0) return false;

  const owner = await getOwner(subscriptionId);
  if (!owner) return false;

  // Aggregate
  const byPlatform: Record<string, number> = {};
  let positive = 0, negative = 0, neutral = 0;
  for (const e of events) {
    byPlatform[e.platform as string] = (byPlatform[e.platform as string] || 0) + 1;
    if (e.sentiment === "positive") positive++;
    else if (e.sentiment === "negative") negative++;
    else neutral++;
  }

  const platformLines = Object.entries(byPlatform)
    .map(([p, n]) => `${PLATFORM_LABEL[p] || p}: ${n}`)
    .join(" · ");

  const sample = events.slice(0, 5).map(e => {
    const snippet = e.body ? String(e.body).slice(0, 90) : "(no text)";
    return `<li style="margin-bottom: 8px; font-size: 13px; color: #4b5563;"><strong>${e.person_name || "Unknown"}</strong> on ${PLATFORM_LABEL[e.platform as string] || e.platform}: <span style="color: #6b7280;">${snippet}</span></li>`;
  }).join("");

  const title = `${events.length} new engagement event${events.length === 1 ? "" : "s"}`;
  const subject = negative > 0
    ? `${title} (${negative} need${negative === 1 ? "s" : ""} attention)`
    : title;

  // Push (short)
  if (preferPush(owner.notify_via)) {
    sendPushNotification(subscriptionId, title, platformLines, {
      type: "engage_digest",
    }).catch(err => console.error("Digest push failed:", err));
  }

  // Email (rich)
  if (owner.email && preferEmail(owner.notify_via)) {
    await sendEmail({
      to: owner.email,
      subject,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px;">
          <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 16px; color: #1a1a1a;">${title}</h2>
          <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
            ${positive ? `<span style="background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 500;">${positive} positive</span>` : ""}
            ${negative ? `<span style="background: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 500;">${negative} negative</span>` : ""}
            ${neutral ? `<span style="background: #f1f5f9; color: #475569; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 500;">${neutral} neutral</span>` : ""}
          </div>
          <p style="font-size: 13px; color: #6b7280; margin: 0 0 20px;">${platformLines}</p>
          <ul style="padding: 0 0 0 20px; margin: 0 0 24px;">${sample}</ul>
          ${events.length > 5 ? `<p style="font-size: 13px; color: #6b7280; margin: 0 0 16px;">+${events.length - 5} more</p>` : ""}
          <p style="margin: 0 0 16px;">
            <a href="https://ops.tracpost.com/engage" style="display: inline-block; background: #3b82f6; color: #fff; padding: 10px 20px; font-size: 14px; font-weight: 500; text-decoration: none; border-radius: 4px;">
              Open Engage Inbox
            </a>
          </p>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
            — TracPost Engage
          </p>
        </div>
      `,
    });
  }

  return true;
}
