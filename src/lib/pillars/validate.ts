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

/**
 * Tag-count bounds per pillar (LOCKED 2026-05-09).
 *
 * Asymmetric on purpose:
 *  - MAX 6 is structural — forces curation, keeps the under-image picker
 *    layout predictable, matches the AI prompt's "4-6 tags" expressed
 *    intent. Subscriber-facing layout depends on this bound.
 *  - MIN 1 is just a token floor to prevent literally-zero-tag pillars
 *    which would break the picker UI. We deliberately don't enforce a
 *    higher floor because forcing 3+ would push subscribers to invent
 *    fluff tags that dilute AI's signal.
 *
 * COACHING_MIN (3) drives a soft warning in the editor — "pillars with
 * fewer than 3 tags rarely sustain content variety" — without blocking
 * the save.
 *
 * Existing data over MAX is grandfathered (not auto-truncated). Any save
 * through the validator must bring it under; subscriber decides which to
 * drop in the editor.
 */
export const MIN_TAGS_PER_PILLAR = 1;
export const MAX_TAGS_PER_PILLAR = 6;
export const COACHING_MIN_TAGS_PER_PILLAR = 3;

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
 * Validate that every entry's `id` is a framework slot AND that tag counts
 * fall within MIN_TAGS_PER_PILLAR..MAX_TAGS_PER_PILLAR.
 * Returns ok:true when all 5 framework slots present + tag counts in range.
 */
export function validatePillarConfig(config: unknown): ValidationResult {
  if (!Array.isArray(config)) {
    return { ok: false, invalidIds: [], message: "config must be an array" };
  }

  const invalidIds: string[] = [];
  const tagCountIssues: string[] = [];
  for (const entry of config) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, invalidIds, message: "config entries must be objects" };
    }
    const id = (entry as PillarConfigEntry).id;
    if (!isFrameworkId(id)) {
      invalidIds.push(typeof id === "string" ? id : String(id));
    }
    const tags = (entry as PillarConfigEntry).tags;
    const tagCount = Array.isArray(tags) ? tags.length : 0;
    const label = (entry as PillarConfigEntry).label || id || "?";
    if (tagCount < MIN_TAGS_PER_PILLAR) {
      tagCountIssues.push(`"${label}" has ${tagCount} tags (min ${MIN_TAGS_PER_PILLAR})`);
    } else if (tagCount > MAX_TAGS_PER_PILLAR) {
      tagCountIssues.push(`"${label}" has ${tagCount} tags (max ${MAX_TAGS_PER_PILLAR})`);
    }
  }

  if (invalidIds.length > 0) {
    return {
      ok: false,
      invalidIds,
      message: `non-framework pillar IDs present: ${invalidIds.join(", ")}. Allowed: ${FRAMEWORK_IDS.join(", ")}`,
    };
  }

  if (tagCountIssues.length > 0) {
    return {
      ok: false,
      invalidIds: [],
      message: `tag count out of range: ${tagCountIssues.join("; ")}`,
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
      INSERT INTO subscriber_actions (business_id, action_type, target_type, target_id, payload)
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
