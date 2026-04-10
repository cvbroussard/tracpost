import { sql } from "@/lib/db";
import { generateAudienceResearch } from "./research-generator";
import { generateBrandAngles } from "./angles-generator";
import { generateHooks } from "./hooks-generator";
import { generateOfferCore } from "./offer-generator";
import { generateContentStrategy } from "./content-strategy-generator";
import type {
  BrandPlaybook,
  BrandAngle,
  ContentHook,
  ContentHooks,
  RatedHook,
  OnboardingInput,
  WizardState,
} from "./types";

export type {
  BrandPlaybook,
  BrandAngle,
  ContentHook,
  ContentHooks,
  RatedHook,
  OnboardingInput,
  WizardState,
};

// ── Wizard State Persistence ───────────────────────────────────────

export async function getWizardState(siteId: string): Promise<WizardState | null> {
  const [row] = await sql`
    SELECT brand_wizard_state FROM sites WHERE id = ${siteId}
  `;
  return (row?.brand_wizard_state as WizardState) || null;
}

async function saveWizardState(siteId: string, state: WizardState): Promise<void> {
  await sql`
    UPDATE sites
    SET brand_wizard_state = ${JSON.stringify(state)},
        updated_at = NOW()
    WHERE id = ${siteId}
  `;
}

// ── Phase 1: Start Research ────────────────────────────────────────

/**
 * Kick off audience research from onboarding input.
 * Returns the generated research + brand angles for selection.
 */
export async function startResearch(
  siteId: string,
  input: OnboardingInput
): Promise<{ angles: BrandAngle[] }> {
  // Generate audience research
  const research = await generateAudienceResearch(input);

  // Generate brand angles from research
  const angles = await generateBrandAngles(input, research);

  // Save wizard state
  const state: WizardState = {
    phase: "angles",
    siteId,
    onboardingInput: input,
    generatedAngles: angles,
  };

  // Also persist the research as partial playbook progress
  const partialPlaybook: Partial<BrandPlaybook> = {
    generatedAt: new Date().toISOString(),
    version: "1.0",
    audienceResearch: research,
  };

  await sql`
    UPDATE sites
    SET brand_wizard_state = ${JSON.stringify(state)},
        brand_playbook = ${JSON.stringify(partialPlaybook)},
        updated_at = NOW()
    WHERE id = ${siteId}
  `;

  return { angles };
}

// ── Phase 2: Select Angles → Generate Hooks ────────────────────────

/**
 * Subscriber selected brand angles. Generate hooks for rating.
 */
export async function selectAnglesAndGenerateHooks(
  siteId: string,
  selectedIndices: number[]
): Promise<{ hooks: ContentHook[] }> {
  const wizardState = await getWizardState(siteId);
  if (!wizardState || wizardState.phase !== "angles") {
    throw new Error("Invalid wizard state for angle selection");
  }

  const allAngles = wizardState.generatedAngles || [];
  const selectedAngles = selectedIndices
    .filter((i) => i >= 0 && i < allAngles.length)
    .map((i) => allAngles[i]);

  if (selectedAngles.length === 0) {
    throw new Error("Must select at least one brand angle");
  }

  // Get research from partial playbook
  const [site] = await sql`
    SELECT brand_playbook FROM sites WHERE id = ${siteId}
  `;
  const partialPlaybook = site?.brand_playbook as Partial<BrandPlaybook>;
  if (!partialPlaybook?.audienceResearch) {
    throw new Error("Audience research not found");
  }

  // Generate hooks
  const hooks = await generateHooks(partialPlaybook.audienceResearch, selectedAngles);

  // Update wizard state
  const state: WizardState = {
    ...wizardState,
    phase: "hooks",
    selectedAngleIndices: selectedIndices,
    generatedHooks: hooks,
  };

  // Update playbook with selected angles
  const updatedPlaybook = {
    ...partialPlaybook,
    brandPositioning: { selectedAngles },
  };

  await sql`
    UPDATE sites
    SET brand_wizard_state = ${JSON.stringify(state)},
        brand_playbook = ${JSON.stringify(updatedPlaybook)},
        updated_at = NOW()
    WHERE id = ${siteId}
  `;

  return { hooks };
}

// ── Phase 3: Rate Hooks → Generate Offer Core → Finalize ───────────

/**
 * Subscriber rated hooks. Generate offer core and finalize playbook.
 */
export async function rateHooksAndFinalize(
  siteId: string,
  ratedHooks: RatedHook[]
): Promise<{ playbook: BrandPlaybook }> {
  const wizardState = await getWizardState(siteId);
  if (!wizardState || wizardState.phase !== "hooks") {
    throw new Error("Invalid wizard state for hook rating");
  }

  // Separate rated hooks
  const lovedHooks = ratedHooks
    .filter((h) => h.rating === "loved")
    .map(({ text, category }) => ({ text, category }));
  const likedHooks = ratedHooks
    .filter((h) => h.rating === "liked")
    .map(({ text, category }) => ({ text, category }));
  const totalRated = ratedHooks.length;
  const skipped = totalRated - lovedHooks.length - likedHooks.length;

  const contentHooks: ContentHooks = {
    lovedHooks,
    likedHooks,
    totalRated,
    summary: { loved: lovedHooks.length, liked: likedHooks.length, skipped },
  };

  // Get partial playbook
  const [site] = await sql`
    SELECT brand_playbook FROM sites WHERE id = ${siteId}
  `;
  const partialPlaybook = site?.brand_playbook as Partial<BrandPlaybook>;
  if (!partialPlaybook?.audienceResearch || !partialPlaybook?.brandPositioning) {
    throw new Error("Incomplete playbook state");
  }

  // Generate offer core
  const offerCore = await generateOfferCore(
    wizardState.onboardingInput!,
    partialPlaybook.audienceResearch,
    partialPlaybook.brandPositioning.selectedAngles,
    contentHooks
  );

  // Assemble final playbook
  const playbook: BrandPlaybook = {
    generatedAt: new Date().toISOString(),
    version: "1.0",
    audienceResearch: partialPlaybook.audienceResearch,
    brandPositioning: partialPlaybook.brandPositioning,
    contentHooks,
    offerCore,
  };

  // Persist hooks to hook_bank table
  const allKeptHooks = [
    ...lovedHooks.map((h) => ({ ...h, rating: "loved" as const })),
    ...likedHooks.map((h) => ({ ...h, rating: "liked" as const })),
  ];

  for (const hook of allKeptHooks) {
    await sql`
      INSERT INTO hook_bank (site_id, text, category, rating)
      VALUES (${siteId}, ${hook.text}, ${hook.category}, ${hook.rating})
    `;
  }

  // Also backfill brand_voice from playbook for backward compat
  const brandVoice = {
    tone: partialPlaybook.brandPositioning.selectedAngles[0]?.tone || "",
    keywords: partialPlaybook.audienceResearch.languageMap.desirePhrases,
    avoid: [],
    // Legacy consumers read from brand_voice; new consumers read from brand_playbook
    _source: "brand_intelligence_v1",
  };

  // Save final playbook, clear wizard state, update brand_voice
  await sql`
    UPDATE sites
    SET brand_playbook = ${JSON.stringify(playbook)},
        brand_voice = ${JSON.stringify(brandVoice)},
        brand_wizard_state = NULL,
        updated_at = NOW()
    WHERE id = ${siteId}
  `;

  // Fire-and-forget: generate content strategy in background
  generateContentStrategy(siteId, playbook).catch((err) => {
    console.error("Content strategy generation failed:", err);
  });

  // Auto-generate article prompts for any qualifying projects
  import("@/lib/pipeline/project-captions").then(({ onPlaybookSharpened }) =>
    onPlaybookSharpened(siteId)
  ).catch((err) => {
    console.error("Auto-prompt on playbook sharpen failed:", err);
  });

  return { playbook };
}

// ── Playbook Access ────────────────────────────────────────────────

export async function getPlaybook(siteId: string): Promise<BrandPlaybook | null> {
  const [row] = await sql`
    SELECT brand_playbook FROM sites WHERE id = ${siteId}
  `;
  const pb = row?.brand_playbook as BrandPlaybook | null;
  if (!pb?.offerCore) return null; // incomplete playbook
  return pb;
}

export async function getHookBank(
  siteId: string,
  rating?: "loved" | "liked"
): Promise<Array<{ text: string; category: string; rating: string }>> {
  if (rating) {
    const rows = await sql`
      SELECT text, category, rating FROM hook_bank
      WHERE site_id = ${siteId} AND rating = ${rating}
      ORDER BY used_count ASC, RANDOM()
    `;
    return rows as Array<{ text: string; category: string; rating: string }>;
  }
  const rows = await sql`
    SELECT text, category, rating FROM hook_bank
    WHERE site_id = ${siteId}
    ORDER BY
      CASE rating WHEN 'loved' THEN 0 ELSE 1 END,
      used_count ASC, RANDOM()
  `;
  return rows as Array<{ text: string; category: string; rating: string }>;
}

/**
 * Mark a hook as used (increment counter). Called by caption/blog generators.
 */
export async function markHookUsed(siteId: string, hookText: string): Promise<void> {
  await sql`
    UPDATE hook_bank
    SET used_count = used_count + 1, last_used_at = NOW()
    WHERE site_id = ${siteId} AND text = ${hookText}
  `;
}
