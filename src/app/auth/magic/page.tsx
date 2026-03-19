import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { validateMagicToken } from "@/lib/magic-link";
import { sql } from "@/lib/db";
import { studioUrl, cookieDomain } from "@/lib/subdomains";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function MagicLinkPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center px-8">
        <div className="text-center">
          <h1 className="mb-2 text-lg font-semibold">Invalid Link</h1>
          <p className="text-sm text-muted">This magic link is missing or malformed.</p>
          <a href="/login" className="mt-4 inline-block text-sm text-accent hover:underline">
            Sign in with email instead
          </a>
        </div>
      </div>
    );
  }

  const subscriberId = await validateMagicToken(token);

  if (!subscriberId) {
    return (
      <div className="flex min-h-screen items-center justify-center px-8">
        <div className="text-center">
          <h1 className="mb-2 text-lg font-semibold">Link Expired</h1>
          <p className="text-sm text-muted">This magic link has expired or has already been used.</p>
          <a href="/login" className="mt-4 inline-block text-sm text-accent hover:underline">
            Sign in with email instead
          </a>
        </div>
      </div>
    );
  }

  // Load subscriber + sites
  const [subscriber] = await sql`
    SELECT id, name, plan, email FROM subscribers WHERE id = ${subscriberId}
  `;

  if (!subscriber) {
    redirect("/login");
  }

  const sites = await sql`
    SELECT id, name, url FROM sites
    WHERE subscriber_id = ${subscriberId}
    ORDER BY created_at ASC
  `;

  // Create session
  const session = {
    subscriberId: subscriber.id,
    subscriberName: subscriber.name,
    plan: subscriber.plan,
    sites: sites.map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      url: s.url,
    })),
    activeSiteId: sites[0]?.id || null,
  };

  const cookieStore = await cookies();
  cookieStore.set("tp_session", JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
    domain: cookieDomain(),
  });

  // Check onboarding status — if no sites, go to setup
  const meta = (subscriber.metadata || {}) as Record<string, unknown>;
  const onboardingStatus = meta.onboarding_status as string;

  if (sites.length === 0 || onboardingStatus === "new") {
    redirect("/setup");
  }

  // Existing subscriber with sites — go to dashboard
  redirect(studioUrl("/") || "/dashboard");
}
