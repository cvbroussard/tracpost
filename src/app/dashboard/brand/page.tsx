import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { BrandWizard } from "./brand-wizard";
import { OnboardingTip } from "@/components/onboarding-tip";

export const dynamic = "force-dynamic";

export default async function BrandPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const siteId = session.activeSiteId;

  // Check current state
  const [site] = await sql`
    SELECT brand_playbook, brand_wizard_state
    FROM sites
    WHERE id = ${siteId} AND subscriber_id = ${session.subscriberId}
  `;

  if (!site) redirect("/dashboard");

  // Determine initial phase and pre-load data
  const playbook = site.brand_playbook as Record<string, unknown> | null;
  const wizardState = site.brand_wizard_state as Record<string, unknown> | null;

  let initialPhase: string = "onboarding";
  let initialAngles: unknown[] | undefined;
  let initialHooks: unknown[] | undefined;

  if (playbook && (playbook as Record<string, unknown>).offerCore) {
    initialPhase = "complete";
  } else if (wizardState) {
    initialPhase = (wizardState.phase as string) || "onboarding";
    initialAngles = wizardState.generatedAngles as unknown[];
    initialHooks = wizardState.generatedHooks as unknown[];
  }

  const hasPlaybook = playbook && (playbook as Record<string, unknown>).offerCore;

  return (
    <div className="py-4">
      <OnboardingTip
        tipKey="brand"
        message="Your playbook is the DNA of every caption, blog post, and hook. The more detail you share about your business and audience, the sharper your content will be."
        incomplete={!hasPlaybook}
      />
      <BrandWizard
        siteId={siteId}
        initialPhase={initialPhase as "onboarding" | "angles" | "hooks" | "complete"}
        initialAngles={initialAngles as never}
        initialHooks={initialHooks as never}
        initialPlaybook={hasPlaybook ? (playbook as Record<string, unknown>) : undefined}
      />
    </div>
  );
}
