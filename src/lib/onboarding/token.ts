/**
 * Onboarding submission tokens — unguessable URL-safe random strings
 * used as both authorization and continuity key for the onboarding form.
 *
 * 32 bytes (256 bits) base64url-encoded → 43 chars. Practically unguessable.
 */
import "server-only";
import { randomBytes } from "crypto";

export function generateOnboardingToken(): string {
  return randomBytes(32).toString("base64url");
}

export function onboardingUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://tracpost.com";
  return `${base}/onboarding/${token}`;
}
