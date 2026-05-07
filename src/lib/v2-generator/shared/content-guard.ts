/**
 * Content safety scan wrapper for v2 generators.
 *
 * Re-exports the v1 scanner so v2 generators can import it from the
 * v2-generator/shared/ surface uniformly. Returns guard.pass + flags;
 * caller decides whether to set status='flagged' vs 'draft'.
 */

export { scanContent } from "@/lib/pipeline/content-guard";
// v1 calls the result type GuardResult internally; not exported.
// Inline shape here so v2 callers don't need to reach into v1 types.
export interface ContentGuardResult {
  pass: boolean;
  flags: string[];
}
