import { sql } from "@/lib/db";
import type { CadenceConfig, PlatformFormat, ContentPillar } from "./types";

/**
 * Generate publishing slots for a site for the next N days.
 *
 * Reads cadence_config from the site, then creates one slot per
 * platform per scheduled time. Distributes slots evenly across
 * the period and rotates through content_pillars.
 *
 * Idempotent: skips slots that already exist for the same
 * account + platform + scheduled_at.
 */
export async function generateSlots(
  siteId: string,
  daysAhead: number = 7
): Promise<number> {
  // Fetch site config
  const [site] = await sql`
    SELECT cadence_config, content_pillars
    FROM sites
    WHERE id = ${siteId} AND autopilot_enabled = true
  `;

  if (!site) return 0;

  const cadence = (site.cadence_config || {}) as CadenceConfig;
  const pillars = (site.content_pillars || []) as ContentPillar[];

  // Fetch connected social accounts for this site
  const accounts = await sql`
    SELECT sa.id, sa.platform
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.status = 'active'
  `;

  if (accounts.length === 0) return 0;

  // Map platform names to cadence keys
  const platformToCadence: Record<string, PlatformFormat[]> = {};
  for (const acct of accounts) {
    const p = acct.platform as string;
    if (p === "instagram") {
      platformToCadence[acct.id] = ["ig_feed", "ig_reel", "ig_story"];
    } else if (p === "facebook") {
      platformToCadence[acct.id] = ["fb_feed", "fb_reel"];
    } else if (p === "youtube") {
      platformToCadence[acct.id] = ["youtube"];
    } else if (p === "gbp") {
      platformToCadence[acct.id] = ["gbp"];
    } else if (p === "tiktok") {
      platformToCadence[acct.id] = ["tiktok"];
    } else if (p === "twitter") {
      platformToCadence[acct.id] = ["twitter"];
    } else if (p === "linkedin") {
      platformToCadence[acct.id] = ["linkedin"];
    } else if (p === "pinterest") {
      platformToCadence[acct.id] = ["pinterest"];
    }
  }

  const now = new Date();
  let created = 0;

  for (const acct of accounts) {
    const formats = platformToCadence[acct.id] || [];

    for (const format of formats) {
      const postsPerWeek = cadence[format] || 0;
      if (postsPerWeek <= 0) continue;

      // Calculate total slots needed for the period
      const totalSlots = Math.round((postsPerWeek / 7) * daysAhead);
      if (totalSlots <= 0) continue;

      // Distribute evenly across the period
      const intervalHours = (daysAhead * 24) / totalSlots;
      let pillarIndex = 0;

      for (let i = 0; i < totalSlots; i++) {
        const slotTime = new Date(
          now.getTime() + i * intervalHours * 60 * 60 * 1000
        );

        // Round to nearest hour, set to a reasonable posting time (10am-7pm)
        slotTime.setMinutes(0, 0, 0);
        const hour = slotTime.getHours();
        if (hour < 10) slotTime.setHours(10);
        if (hour > 19) slotTime.setHours(17);

        // Rotate pillars (stories don't need pillar rotation)
        const pillar =
          format === "ig_story"
            ? null
            : pillars[pillarIndex % pillars.length] || null;
        if (format !== "ig_story" && pillars.length > 0) {
          pillarIndex++;
        }

        // Insert only if no slot exists for this account + platform + time
        const [inserted] = await sql`
          INSERT INTO publishing_slots (site_id, account_id, platform, content_pillar, scheduled_at)
          SELECT ${siteId}, ${acct.id}, ${format}, ${pillar}, ${slotTime.toISOString()}
          WHERE NOT EXISTS (
            SELECT 1 FROM publishing_slots
            WHERE account_id = ${acct.id}
              AND platform = ${format}
              AND scheduled_at = ${slotTime.toISOString()}
          )
          RETURNING id
        `;

        if (inserted) created++;
      }
    }
  }

  return created;
}
