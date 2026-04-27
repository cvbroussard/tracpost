import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Tenant-facing /brand status page.
 *
 * Brand DNA is a TracPost-internal artifact — derived, refined, and
 * managed entirely on the operator side. Tenants don't sharpen it,
 * regenerate it, or see its internals. They see the *output* (their
 * published content) and a status banner here. This route exists only
 * to give the historical /dashboard/brand URL a graceful destination.
 *
 * Operator-side controls live at /manage/brand. The full sharpen +
 * regenerate flow happens in DNA Staging there.
 */
export default async function BrandPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const [site] = await sql`
    SELECT name, brand_playbook
    FROM sites
    WHERE id = ${session.activeSiteId} AND subscription_id = ${session.subscriptionId}
  `;
  if (!site) redirect("/dashboard");

  const hasPlaybook = site.brand_playbook && Object.keys(site.brand_playbook as object).length > 0;

  return (
    <div className="p-4">
      <div className="max-w-2xl mx-auto py-12">
        <h1 className="text-2xl font-semibold mb-3">Your brand voice</h1>
        <p className="text-muted leading-relaxed mb-8">
          {hasPlaybook
            ? `Your brand voice is being learned from your social presence and refined as you grow. It drives every caption, blog article, and social hook we create for ${site.name || "your business"}.`
            : `Your brand voice is being established. As your social presence grows, we refine how we describe and represent your business across every piece of content we create.`}
        </p>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <h2 className="text-sm font-semibold mb-2">Managed by your team</h2>
          <p className="text-xs text-muted leading-relaxed">
            You don&apos;t need to configure this. Your assigned content team monitors and refines your brand voice continuously. If you want to adjust direction or share specific feedback, contact us through Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
