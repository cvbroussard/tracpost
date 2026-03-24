import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { BrandPlaybookView } from "./brand-playbook-view";

export const dynamic = "force-dynamic";

export default async function BrandPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const siteId = session.activeSiteId;

  const [site] = await sql`
    SELECT brand_playbook, brand_voice, provisioning_status
    FROM sites
    WHERE id = ${siteId} AND subscriber_id = ${session.subscriberId}
  `;

  if (!site) redirect("/dashboard");

  const playbook = site.brand_playbook as Record<string, unknown> | null;
  const hasPlaybook = playbook && playbook.offerCore;
  const brandVoice = (site.brand_voice || {}) as Record<string, unknown>;
  const subscriberAngle = (brandVoice._subscriberAngle as string) || null;
  const isProvisioning = site.provisioning_status === "requested" || site.provisioning_status === "in_progress";

  return (
    <div className="mx-auto max-w-2xl py-4">
      {!hasPlaybook && isProvisioning && (
        <div className="py-16 text-center">
          <div className="mb-4 mx-auto h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <h1>Generating Your Brand Playbook</h1>
          <p className="mt-2 text-muted">
            Our team is building your brand intelligence. This typically takes a few minutes.
          </p>
        </div>
      )}

      {!hasPlaybook && !isProvisioning && (
        <div className="py-16 text-center">
          <h1>Brand Intelligence</h1>
          <p className="mt-2 text-muted">
            Your brand playbook will appear here once provisioning begins.
          </p>
        </div>
      )}

      {hasPlaybook ? (
        <BrandPlaybookView
          siteId={siteId}
          playbook={playbook as Record<string, unknown>}
          subscriberAngle={subscriberAngle}
        />
      ) : null}
    </div>
  );
}
