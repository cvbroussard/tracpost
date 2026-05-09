/**
 * Pillar framework validation.
 *
 * The 5 framework slot IDs (`what`/`how`/`who`/`proof`/`why`) are read-only
 * structural truth. Sites can customize `label`, `description`, `tags`
 * within each slot — never the `id`. This standardizes cross-site analytics
 * and orchestrator behavior.
 *
 * Per the design lock 2026-05-08: any upsert that includes a non-framework
 * `id` is malformed and gets rejected. The intercepting endpoints log the
 * attempt so we can trace the offending writer (AI auto-generation, manual
 * input, migration script, etc.) and fix it.
 */

import { sql } from "@/lib/db";

export const FRAMEWORK_IDS = ["what", "how", "who", "proof", "why"] as const;
export type FrameworkId = typeof FRAMEWORK_IDS[number];

export const FRAMEWORK_LABELS: Record<FrameworkId, string> = {
  what: "What We Do",
  how: "How We Do It",
  who: "Who We Work With",
  proof: "Proof It Works",
  why: "Why It Matters",
};

export function isFrameworkId(id: unknown): id is FrameworkId {
  return typeof id === "string" && (FRAMEWORK_IDS as readonly string[]).includes(id);
}

export interface PillarConfigEntry {
  id: string;
  label?: string;
  description?: string;
  tags?: Array<{ id: string; label: string }>;
  framework?: string;
}

export interface ValidationResult {
  ok: boolean;
  invalidIds: string[];
  message?: string;
}

/**
 * Validate that every entry's `id` is a framework slot.
 * Returns ok:true when all 5 framework slots present (extras allowed).
 */
export function validatePillarConfig(config: unknown): ValidationResult {
  if (!Array.isArray(config)) {
    return { ok: false, invalidIds: [], message: "config must be an array" };
  }

  const invalidIds: string[] = [];
  for (const entry of config) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, invalidIds, message: "config entries must be objects" };
    }
    const id = (entry as PillarConfigEntry).id;
    if (!isFrameworkId(id)) {
      invalidIds.push(typeof id === "string" ? id : String(id));
    }
  }

  if (invalidIds.length > 0) {
    return {
      ok: false,
      invalidIds,
      message: `non-framework pillar IDs present: ${invalidIds.join(", ")}. Allowed: ${FRAMEWORK_IDS.join(", ")}`,
    };
  }

  return { ok: true, invalidIds: [] };
}

/**
 * Log a malformed-config attempt so operators can trace the offending
 * writer and fix it. Writes a structured row to subscriber_actions for
 * audit; failure of this insert is non-fatal (don't block the rejection).
 */
export async function logMalformedAttempt(
  siteId: string,
  source: string,
  invalidIds: string[],
  rawConfig: unknown,
): Promise<void> {
  try {
    await sql`
      INSERT INTO subscriber_actions (site_id, action_type, target_type, target_id, payload)
      VALUES (
        ${siteId},
        'pillar_config_rejected',
        'site',
        ${siteId},
        ${JSON.stringify({
          source,
          invalidIds,
          rawConfig,
          rejectedAt: new Date().toISOString(),
        })}
      )
    `;
  } catch (err) {
    console.error(
      "Failed to log pillar_config rejection:",
      err instanceof Error ? err.message : err,
    );
  }
}
