/**
 * Onboarding OAuth helpers — used by /api/auth/[platform]/callback to
 * detect onboarding-source flows and mark per-platform status on the
 * onboarding_submissions row. Side-effect-free if state isn't from
 * onboarding (no-op).
 */
import "server-only";
import { setPlatformStatus } from "./queries";

export interface OAuthStateLike {
  source?: string | null;
  onboarding_token?: string;
  subscription_id?: string;
}

/**
 * Decode an OAuth state string (base64url JSON) to its object form.
 * Returns null if invalid (e.g., not from us, or tampered).
 */
export function parseOAuthState(state: string | null): OAuthStateLike | null {
  if (!state) return null;
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    return JSON.parse(decoded) as OAuthStateLike;
  } catch {
    return null;
  }
}

/**
 * Mark a platform as connected/failed/skipped in the onboarding_submissions
 * row, IF this OAuth flow came from onboarding. No-op otherwise.
 */
export async function markOnboardingPlatformIfNeeded(
  state: OAuthStateLike,
  platform: string,
  status: "connected" | "failed" | "skipped"
): Promise<void> {
  if (state.source === "onboarding" && state.onboarding_token) {
    try {
      await setPlatformStatus(state.onboarding_token, platform, status);
    } catch (err) {
      console.error(`Failed to mark onboarding platform ${platform}=${status}:`, err);
    }
  }
}

/**
 * Build the OAuth state object for an onboarding-context flow. Use this
 * in the new /api/onboarding/[token]/connect/[platform] start endpoint.
 */
export function buildOnboardingState(input: {
  subscriptionId: string;
  onboardingToken: string;
  platform: string;
  extra?: Record<string, unknown>;
}): string {
  return Buffer.from(
    JSON.stringify({
      subscription_id: input.subscriptionId,
      source: "onboarding",
      onboarding_token: input.onboardingToken,
      platform: input.platform,
      ...(input.extra || {}),
    })
  ).toString("base64url");
}
