/**
 * GET /api/onboarding/[token]/connect/[platform]
 *
 * Initiates OAuth from the onboarding form, authenticated by the
 * onboarding token (no session required since the subscriber has no
 * account login yet). Returns a 302 to the platform's authorization
 * URL with a state token that carries onboarding context.
 *
 * Supported platforms: meta (instagram + facebook), gbp (google),
 * linkedin, youtube, pinterest, tiktok, twitter.
 *
 * The platform's existing callback handler (e.g.,
 * /api/auth/instagram/callback) decodes the state, sees source=onboarding,
 * records the OAuth grant + assets against the subscription_id, then
 * redirects back to /onboarding/[token] via oauth-redirect.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { getByToken, isExpired } from "@/lib/onboarding/queries";
import { buildOnboardingState } from "@/lib/onboarding/oauth-helpers";
import { getMetaAuthUrl } from "@/lib/meta";
import { getGoogleAuthUrl } from "@/lib/google";
import { getLinkedInAuthUrl } from "@/lib/linkedin";
import { getYouTubeAuthUrl } from "@/lib/youtube";
import { getPinterestAuthUrl } from "@/lib/pinterest";
import { getTikTokAuthUrl } from "@/lib/tiktok";
import { getTwitterAuthUrl, generateCodeVerifier } from "@/lib/twitter";

const SUPPORTED = new Set(["meta", "gbp", "linkedin", "youtube", "pinterest", "tiktok", "twitter"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; platform: string }> }
) {
  const { token, platform } = await params;

  if (!SUPPORTED.has(platform)) {
    return NextResponse.json({ error: `Unsupported platform: ${platform}` }, { status: 400 });
  }

  const submission = await getByToken(token);
  if (!submission) {
    return NextResponse.json({ error: "Onboarding link not found" }, { status: 404 });
  }
  if (isExpired(submission)) {
    return NextResponse.json({ error: "Onboarding link expired" }, { status: 410 });
  }
  if (submission.completed_at) {
    return NextResponse.json({ error: "Onboarding already completed" }, { status: 409 });
  }

  // Twitter requires a code_verifier stored server-side (PKCE). Stash in cookie.
  let codeVerifier: string | undefined;
  if (platform === "twitter") {
    codeVerifier = generateCodeVerifier();
  }

  const state = buildOnboardingState({
    subscriptionId: submission.subscription_id,
    onboardingToken: token,
    platform,
  });

  let authUrl: string;
  try {
    switch (platform) {
      case "meta":
        authUrl = getMetaAuthUrl(state);
        break;
      case "gbp":
        authUrl = getGoogleAuthUrl(state);
        break;
      case "linkedin":
        authUrl = getLinkedInAuthUrl(state);
        break;
      case "youtube":
        authUrl = getYouTubeAuthUrl(state);
        break;
      case "pinterest":
        authUrl = getPinterestAuthUrl(state);
        break;
      case "tiktok":
        authUrl = getTikTokAuthUrl(state);
        break;
      case "twitter":
        authUrl = getTwitterAuthUrl(state, codeVerifier!);
        break;
      default:
        return NextResponse.json({ error: "Unhandled platform" }, { status: 500 });
    }
  } catch (err) {
    console.error(`OAuth start error for ${platform}:`, err);
    return NextResponse.json({ error: `Could not start ${platform} OAuth` }, { status: 500 });
  }

  // Redirect directly to platform auth URL
  const response = NextResponse.redirect(authUrl);
  if (codeVerifier) {
    // Twitter PKCE — must persist code_verifier across the round trip
    response.cookies.set("twitter_code_verifier", codeVerifier, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600, // 10 min
      path: "/",
    });
  }
  return response;
}
