/**
 * engaged_persons + engaged_person_handles helpers.
 *
 * The relationship database. Built incrementally from engagement events,
 * not from imported follower lists.
 */
import "server-only";
import { sql } from "@/lib/db";

export interface UpsertPersonInput {
  subscriptionId: string;
  platform: string;
  platformUserId: string;
  displayName: string;
  handle?: string | null;
  profileUrl?: string | null;
  avatarUrl?: string | null;
  followerCount?: number | null;
}

/**
 * Find or create an engaged_person + handle row from incoming engagement.
 * Returns the engaged_person.id so the engagement_event can link to it.
 */
export async function upsertEngagedPerson(input: UpsertPersonInput): Promise<string> {
  // 1. Look up existing handle by (platform, platform_user_id)
  const [existingHandle] = await sql`
    SELECT id, engaged_person_id
    FROM engaged_person_handles
    WHERE platform = ${input.platform} AND platform_user_id = ${input.platformUserId}
  `;

  if (existingHandle) {
    // Update last_seen_at and any new info
    await sql`
      UPDATE engaged_person_handles
      SET handle = COALESCE(${input.handle}, handle),
          profile_url = COALESCE(${input.profileUrl}, profile_url),
          avatar_url = COALESCE(${input.avatarUrl}, avatar_url),
          follower_count = COALESCE(${input.followerCount}, follower_count),
          last_seen_at = NOW()
      WHERE id = ${existingHandle.id}
    `;
    return existingHandle.engaged_person_id as string;
  }

  // 2. New person — create the engaged_person row first
  const [newPerson] = await sql`
    INSERT INTO engaged_persons (subscription_id, display_name)
    VALUES (${input.subscriptionId}, ${input.displayName})
    RETURNING id
  `;

  // 3. Create the handle row tied to the new person
  await sql`
    INSERT INTO engaged_person_handles (
      engaged_person_id, platform, platform_user_id, handle,
      profile_url, avatar_url, follower_count
    )
    VALUES (
      ${newPerson.id}, ${input.platform}, ${input.platformUserId},
      ${input.handle || null}, ${input.profileUrl || null},
      ${input.avatarUrl || null}, ${input.followerCount || null}
    )
  `;

  return newPerson.id as string;
}

/**
 * Update aggregate stats on a person after an engagement event lands.
 */
export async function refreshPersonAggregates(engagedPersonId: string): Promise<void> {
  await sql`
    UPDATE engaged_persons
    SET engagement_count = (
          SELECT COUNT(*)::int FROM engagement_events WHERE engaged_person_id = ${engagedPersonId}
        ),
        positive_engagements = (
          SELECT COUNT(*)::int FROM engagement_events
          WHERE engaged_person_id = ${engagedPersonId} AND sentiment = 'positive'
        ),
        negative_engagements = (
          SELECT COUNT(*)::int FROM engagement_events
          WHERE engaged_person_id = ${engagedPersonId} AND sentiment = 'negative'
        ),
        last_seen_at = (
          SELECT MAX(occurred_at) FROM engagement_events WHERE engaged_person_id = ${engagedPersonId}
        ),
        is_advocate = (
          SELECT COUNT(*)::int FROM engagement_events
          WHERE engaged_person_id = ${engagedPersonId} AND sentiment = 'positive'
        ) >= 3,
        updated_at = NOW()
    WHERE id = ${engagedPersonId}
  `;
}
