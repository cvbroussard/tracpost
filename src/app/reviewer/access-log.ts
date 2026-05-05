import { headers } from "next/headers";

/**
 * Access logging for reviewer guide pages.
 *
 * Called from each reviewer page's server component on render.
 * Logs to console (Vercel captures stdout) so we can grep deploy logs
 * during the 4-6 week review window for reviewer activity.
 *
 * Format: `REVIEWER_ACCESS path=... ip=... ua=... ref=... ts=...`
 *
 * During weeks 4-5 of waiting, grep Vercel logs for `REVIEWER_ACCESS`
 * to see whether reviewers are actually opening the page. No DB schema
 * needed; logs are sufficient signal.
 */
export async function logReviewerAccess(path: string): Promise<void> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  const ua = h.get("user-agent") || "unknown";
  const ref = h.get("referer") || "direct";
  const ts = new Date().toISOString();

  // Single-line so grep/jq parsing stays simple.
  console.log(
    `REVIEWER_ACCESS path=${path} ip=${ip} ua=${JSON.stringify(ua)} ref=${JSON.stringify(ref)} ts=${ts}`,
  );
}
