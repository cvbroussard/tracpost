/**
 * Generate the hero image for a brand's home page.
 *
 * Phase 2 MVP. Composes a catalog-anchored image prompt, calls Nano
 * Banana (gemini-2.5-flash-image) via the existing image-gen wrapper,
 * uploads bytes to R2, persists as a media_asset row with explicit
 * provenance, and updates the latest website_content draft's
 * hero_image binding so the rendered page consumes the generated image.
 *
 * Provenance discipline: every generated image is tagged
 * `metadata.provenance = "ai_generated_v1"` so future code (and the
 * deferred swap UI) can distinguish AI-generated assets from
 * owner-uploaded ones.
 *
 * Owner override path (deferred): swap the media_asset reference on
 * the website_content row. Generated image stays in R2 as historical
 * trail; nothing destructive happens to the generated asset.
 */
import { sql } from "@/lib/db";
import { randomUUID } from "crypto";
import { uploadBufferToR2 } from "@/lib/r2";
import { generateEditorialImage } from "@/lib/image-gen/gemini";
import { loadInput } from "@/lib/website-gen/load-input";
import { buildHeroImagePrompt } from "@/lib/image-gen/catalog-to-prompt";
import type { PageContent, HeroSection } from "@/lib/website-gen/types";

export interface HeroImageGenResult {
  asset_id: string;
  url: string;
  durationMs: number;
  bytesSize: number;
  promptUsed: string;
  catalogDescriptorsUsed: string[];
  catalogDescriptorsMissing: string[];
  draftId: string;
}

/**
 * Generate and persist a hero image for the latest draft home page of
 * the given business. Throws if no draft exists yet (run Phase 1 first).
 */
export async function generateHeroImageForBusiness(
  businessId: string,
): Promise<HeroImageGenResult> {
  const start = Date.now();

  // Load the latest draft home page so we can read the hero section's
  // alt text + know which row to update.
  const [draft] = await sql`
    SELECT id, content
    FROM website_content
    WHERE business_id = ${businessId}
      AND page_key = 'home'
      AND status = 'draft'
    ORDER BY generated_at DESC
    LIMIT 1
  `;
  if (!draft) {
    throw new Error(
      "image-gen: no home-page draft exists for this business — run the Phase 1 generator first",
    );
  }
  const draftId = draft.id as string;
  const content = draft.content as PageContent;
  const heroSection = content.sections.find((s) => s.type === "hero") as
    | HeroSection
    | undefined;
  if (!heroSection) {
    throw new Error("image-gen: home draft has no hero section");
  }

  // Reload full input so the prompt builder has access to catalog.
  const input = await loadInput(businessId);
  const built = buildHeroImagePrompt(input, heroSection);

  // Generate via Nano Banana
  const image = await generateEditorialImage(built.prompt, built.aspectRatio);
  if (!image) {
    throw new Error("image-gen: Nano Banana returned no image (check GOOGLE_AI_API_KEY + quota)");
  }

  // Upload bytes to R2 with provenance baked into the key path.
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = image.mimeType === "image/jpeg" ? "jpg" : "png";
  const r2Key = `website-gen/hero/${businessId}/${ts}.${ext}`;
  const storageUrl = await uploadBufferToR2(r2Key, image.data, image.mimeType);

  // Insert media_assets row with provenance metadata so future swap UI
  // can distinguish AI-generated vs owner-uploaded.
  const assetId = randomUUID();
  await sql`
    INSERT INTO media_assets (
      id, business_id, storage_url, media_type, context_note,
      source, processing_stage,
      ai_analysis, metadata
    )
    VALUES (
      ${assetId},
      ${businessId},
      ${storageUrl},
      'image',
      ${`Generated hero image (website-gen Phase 2). Prompt seed: ${built.prompt.slice(0, 180)}…`},
      'ai_generated',
      'briefed',
      ${JSON.stringify({
        role: "hero_primary",
        page_key: "home",
        prompt_summary: built.prompt.slice(0, 300),
      })}::jsonb,
      ${JSON.stringify({
        provenance: "ai_generated_v1",
        role: "hero_primary",
        page_key: "home",
        model: "gemini-2.5-flash-image",
        aspect_ratio: built.aspectRatio,
        catalog_descriptors_used: built.meta.catalog_descriptors_used,
        catalog_descriptors_missing: built.meta.catalog_descriptors_missing,
        alt_text_source: built.meta.alt_text_source,
        prompt_full: built.prompt,
        generated_at: new Date().toISOString(),
        source_draft_id: draftId,
      })}::jsonb
    )
  `;

  // Update the draft's hero_image binding so the renderer (when wired)
  // picks up the generated asset.
  const updatedSections = content.sections.map((section) => {
    if (section.type !== "hero") return section;
    return {
      ...section,
      hero_image: {
        asset_id: assetId,
        url: storageUrl,
        alt: section.hero_image?.alt ?? "Hero image",
      },
    };
  });
  const updatedContent: PageContent = {
    ...content,
    sections: updatedSections,
  };
  await sql`
    UPDATE website_content
    SET content = ${JSON.stringify(updatedContent)}::jsonb,
        updated_at = NOW()
    WHERE id = ${draftId}
  `;

  return {
    asset_id: assetId,
    url: storageUrl,
    durationMs: Date.now() - start,
    bytesSize: image.data.byteLength,
    promptUsed: built.prompt,
    catalogDescriptorsUsed: built.meta.catalog_descriptors_used,
    catalogDescriptorsMissing: built.meta.catalog_descriptors_missing,
    draftId,
  };
}
