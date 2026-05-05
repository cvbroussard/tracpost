import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ComposeClient } from "./compose-client";

export const dynamic = "force-dynamic";

/**
 * Compose page — the unified composer surface for all platforms.
 *
 * Phase 2 of the publish-module refactor (task #82). Single working
 * surface (NOT per-platform pages) that follows the unified subscriber
 * UX pattern: Select template → Recommend package → Review preview →
 * Trigger publish.
 *
 * The template carries the platform decision; subscriber doesn't pick
 * "platform" then "format" — they pick a template, which carries both.
 *
 * Not in the sidebar yet — direct URL access only during Phase 2 build.
 * Sidebar entry lands in Phase 4 (post-review).
 */
export default async function ComposePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  return <ComposeClient siteId={session.activeSiteId} />;
}
