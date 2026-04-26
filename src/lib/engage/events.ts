/**
 * engagement_events helpers — record raw activity from platform pulls.
 */
import "server-only";
import { sql } from "@/lib/db";
import { upsertEngagedPerson, refreshPersonAggregates } from "./persons";
import { analyzeSentiment } from "./sentiment";
import { notifyNegativeEngagement } from "./notify";

export interface RecordEventInput {
  subscriptionId: string;
  siteId?: string | null;
  platformAssetId?: string | null;
  platform: string;
  eventType: string;
  targetType?: string | null;
  platformTargetId: string;
  body?: string | null;
  permalink?: string | null;
  occurredAt: Date | string;
  // Person info from the platform response
  personDisplayName: string;
  personPlatformUserId: string;
  personHandle?: string | null;
  personProfileUrl?: string | null;
  personAvatarUrl?: string | null;
  personFollowerCount?: number | null;
  // Optional sentiment override (otherwise computed from body)
  sentiment?: "positive" | "neutral" | "negative" | null;
  metadata?: Record<string, unknown>;
}

/**
 * Record one engagement event, creating or linking the engaged_person.
 * Idempotent on (platform, platform_target_id, event_type).
 * Returns true if the event was newly inserted, false if it was a duplicate.
 */
export async function recordEngagementEvent(input: RecordEventInput): Promise<boolean> {
  // 1. Resolve / create the engaged_person
  const personId = await upsertEngagedPerson({
    subscriptionId: input.subscriptionId,
    platform: input.platform,
    platformUserId: input.personPlatformUserId,
    displayName: input.personDisplayName,
    handle: input.personHandle,
    profileUrl: input.personProfileUrl,
    avatarUrl: input.personAvatarUrl,
    followerCount: input.personFollowerCount,
  });

  // 2. Compute sentiment if not provided. Explicit override (e.g., GBP star
  //    rating) wins. Otherwise LLM-classify from the body.
  let sentiment: "positive" | "neutral" | "negative" | null = input.sentiment || null;
  let sentimentScore: number = sentiment === "positive" ? 0.7 : sentiment === "negative" ? -0.7 : 0;
  let rationale: string | null = null;

  if (!input.sentiment && input.body) {
    const result = await analyzeSentiment(input.body);
    sentiment = result.sentiment;
    sentimentScore = result.score;
    rationale = result.rationale;
  }

  // 3. Auto-archive historical events on insert. First-capture for an active
  //    subscriber typically returns years of past activity; we don't want
  //    those flooding the inbox or counting as "unreviewed."
  const occurredAtMs = new Date(input.occurredAt).getTime();
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const reviewStatus = occurredAtMs < thirtyDaysAgo ? "archived" : "new";

  // 4. Insert the event (idempotent on conflict)
  const inserted = await sql`
    INSERT INTO engagement_events (
      subscription_id, site_id, platform_asset_id, engaged_person_id,
      platform, event_type, target_type, platform_target_id,
      body, sentiment, sentiment_score, permalink,
      occurred_at, review_status, metadata
    )
    VALUES (
      ${input.subscriptionId}, ${input.siteId || null}, ${input.platformAssetId || null}, ${personId},
      ${input.platform}, ${input.eventType}, ${input.targetType || null}, ${input.platformTargetId},
      ${input.body || null}, ${sentiment}, ${sentimentScore}, ${input.permalink || null},
      ${typeof input.occurredAt === "string" ? input.occurredAt : input.occurredAt.toISOString()},
      ${reviewStatus},
      ${JSON.stringify({ ...(input.metadata || {}), ...(rationale ? { sentiment_rationale: rationale } : {}) })}
    )
    ON CONFLICT (platform, platform_target_id, event_type) DO NOTHING
    RETURNING id
  `;

  if (inserted.length > 0) {
    await refreshPersonAggregates(personId);

    // Fire immediate notification only when this is a fresh, active negative
    // event. Auto-archived historicals (>30 days old) don't notify.
    if (sentiment === "negative" && reviewStatus === "new") {
      notifyNegativeEngagement({
        subscriptionId: input.subscriptionId,
        platform: input.platform,
        eventType: input.eventType,
        body: input.body || null,
        personDisplayName: input.personDisplayName,
        permalink: input.permalink || null,
      }).catch(err => console.error("notifyNegativeEngagement failed:", err));
    }

    return true;
  }
  return false;
}
