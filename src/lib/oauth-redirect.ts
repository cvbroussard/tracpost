/**
 * OAuth redirect helper — returns the appropriate redirect URL
 * based on whether the flow was initiated from mobile, web dashboard,
 * admin, or onboarding form.
 */
import { studioUrl, platformUrl } from "./subdomains";

const MOBILE_CALLBACK = "tracpost-studio://auth/complete";
const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || "https://tracpost.com";

export function oauthSuccessUrl(
  source: string | undefined,
  accountName: string,
  onboardingToken?: string,
  platform?: string
): string {
  if (source === "onboarding" && onboardingToken) {
    const platformParam = platform ? `&completed=${encodeURIComponent(platform)}` : "";
    return `${APP_BASE}/onboarding/${encodeURIComponent(onboardingToken)}?connected=${encodeURIComponent(accountName)}${platformParam}`;
  }
  if (source === "mobile") {
    return `${MOBILE_CALLBACK}?connected=${encodeURIComponent(accountName)}`;
  }
  if (source === "admin") {
    return `${platformUrl("/provisioning")}?connected=${encodeURIComponent(accountName)}`;
  }
  if (source === "campaigns") {
    return `${studioUrl("/campaigns")}?connected=${encodeURIComponent(accountName)}`;
  }
  return `${studioUrl("/accounts")}?connected=${encodeURIComponent(accountName)}`;
}

export function oauthErrorUrl(
  source: string | undefined,
  error: string,
  detail?: string,
  onboardingToken?: string,
  platform?: string
): string {
  const detailParam = detail ? `&detail=${encodeURIComponent(detail.slice(0, 200))}` : "";
  if (source === "onboarding" && onboardingToken) {
    const platformParam = platform ? `&platform=${encodeURIComponent(platform)}` : "";
    return `${APP_BASE}/onboarding/${encodeURIComponent(onboardingToken)}?error=${error}${detailParam}${platformParam}`;
  }
  if (source === "mobile") {
    return `${MOBILE_CALLBACK}?error=${error}${detailParam}`;
  }
  if (source === "admin") {
    return `${platformUrl("/provisioning")}?error=${error}${detailParam}`;
  }
  if (source === "campaigns") {
    return `${studioUrl("/campaigns")}?error=${error}${detailParam}`;
  }
  return `${studioUrl("/accounts")}?error=${error}${detailParam}`;
}
