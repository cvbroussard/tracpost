/**
 * Autopilot activation check.
 *
 * Conditions — ALL must be true:
 * 1. Brand playbook exists
 * 2. Reward prompts exist (auto-generated from playbook)
 * 3. 3+ triaged assets on the site
 *
 * When met → autopilot_enabled = true automatically.
 * Called from: playbook sharpened, asset triaged, blog cron.
 */
import { sql } from "@/lib/db";

export async function checkAndActivateAutopilot(siteId: string): Promise<boolean> {
  const [site] = await sql`
    SELECT autopilot_enabled,
           brand_playbook IS NOT NULL AS has_playbook,
           metadata->'reward_prompts' IS NOT NULL AS has_prompts,
           jsonb_array_length(COALESCE(metadata->'reward_prompts', '[]'::jsonb)) AS prompt_count,
           metadata->>'autopilot_locked' AS autopilot_locked
    FROM sites WHERE id = ${siteId}
  `;

  if (!site) return false;

  // Already enabled
  if (site.autopilot_enabled) return true;

  // Admin manually disabled — don't re-enable automatically
  if (site.autopilot_locked === "true") return false;

  // Check conditions
  if (!site.has_playbook) return false;
  if (!site.has_prompts || (site.prompt_count as number) === 0) return false;

  // Check 3+ triaged assets
  const [count] = await sql`
    SELECT COUNT(*)::int AS c FROM media_assets
    WHERE site_id = ${siteId} AND triage_status = 'triaged'
  `;
  if ((count?.c || 0) < 3) return false;

  // All conditions met — activate
  await sql`
    UPDATE sites SET autopilot_enabled = true, updated_at = NOW()
    WHERE id = ${siteId}
  `;
  console.log(`Autopilot activated for site ${siteId}`);
  return true;
}
