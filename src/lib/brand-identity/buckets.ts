/**
 * Bucket assignment for brand identity descriptors per the locked
 * Statistical/Creative split (2026-06-01, see
 * project_tracpost_brand_identity_schema.md).
 *
 * Client-safe — no server imports — so client components can filter by
 * bucket without pulling server code into the bundle. The strategic
 * recommendation engine imports `STATISTICAL_DESCRIPTOR_KEYS` from here
 * too, so this file is the single source of truth.
 */

/** The 6 Statistical-bucket descriptor keys — engine-generated, owner-approved. */
export const STATISTICAL_DESCRIPTOR_KEYS = [
  "offer",
  "audience",
  "positioning",
  "hooks",
  "tagline",
  "cta",
] as const;

export type StatisticalDescriptorKey = (typeof STATISTICAL_DESCRIPTOR_KEYS)[number];

const STATISTICAL_SET = new Set<string>(STATISTICAL_DESCRIPTOR_KEYS);

export type Bucket = "statistical" | "creative";

/** Returns the bucket a given descriptor key belongs to. */
export function descriptorBucket(key: string): Bucket {
  return STATISTICAL_SET.has(key) ? "statistical" : "creative";
}

/** True if the descriptor key is in the Statistical bucket. */
export function isStatistical(key: string): boolean {
  return STATISTICAL_SET.has(key);
}
