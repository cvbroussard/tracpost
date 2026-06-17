/**
 * Generate a hero image for one service.
 *
 * Three-stage orchestration:
 *   1. buildServiceHeroPrompt — LLM produces {image_prompt, alt}
 *      from service context + brand catalog (Sonnet 4.5 call)
 *   2. generateEditorialImage — Nano Banana renders the image
 *   3. Persist — upload to R2, insert media_assets row, UPDATE
 *      services.hero_asset_id
 *
 * Per [[stable-service-identity]]: hero_asset_id is a stable field on
 * the service row. Generating a hero binds permanently to that row
 * (survives subsequent name/description regenerations). Operator can
 * regenerate the hero explicitly via this same function — old asset
 * stays in R2 for history but the binding moves to the new one.
 */
import "server-only";
import { sql } from "@/lib/db";
import { randomUUID } from "crypto";
import { uploadBufferToR2 } from "@/lib/r2";
import { generateEditorialImage } from "@/lib/image-gen/gemini";
import { loadInput } from "@/lib/website-gen/load-input";
import { buildServiceHeroPrompt, type BuiltServiceHeroPrompt } from "./service-hero-prompt";

export interface ServiceHeroGenResult {
  serviceId: string;
  assetId: string;
  url: string;
  alt: string;
  prompt: string;
  durationMs: number;
  bytesSize: number;
  catalogDescriptorsUsed: string[];
  catalogDescriptorsMissing: string[];
  model: string;
}

interface LoadedService {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  primary_gcid: string | null;
  cluster_intent_label: string | null;
  primary_category_name: string | null;
}

async function loadService(siteId: string, serviceId: string): Promise<LoadedService> {
  const [row] = await sql`
    SELECT s.id, s.business_id, s.name, s.description, s.primary_gcid,
           s.metadata->>'cluster_intent_label' AS cluster_intent_label,
           gc.name AS primary_category_name
    FROM services s
    LEFT JOIN gbp_categories gc ON gc.gcid = s.primary_gcid
    WHERE s.id = ${serviceId} AND s.business_id = ${siteId}
    LIMIT 1
  `;
  if (!row) {
    throw new Error(`service-hero: service ${serviceId} not found for business ${siteId}`);
  }
  return {
    id: row.id as string,
    business_id: row.business_id as string,
    name: row.name as string,
    description: row.description ? String(row.description) : null,
    primary_gcid: row.primary_gcid ? String(row.primary_gcid) : null,
    cluster_intent_label: row.cluster_intent_label ? String(row.cluster_intent_label) : null,
    primary_category_name: row.primary_category_name ? String(row.primary_category_name) : null,
  };
}

/**
 * Preview-only — build the prompt + alt without firing image generation.
 * Lets the UI show the prompt/alt panel before the operator commits to
 * the ~$0.04 image-gen cost.
 */
export async function previewServiceHeroPrompt(
  siteId: string,
  serviceId: string,
): Promise<BuiltServiceHeroPrompt & { service: LoadedService }> {
  const service = await loadService(siteId, serviceId);
  const input = await loadInput(siteId);
  const built = await buildServiceHeroPrompt({
    serviceName: service.name,
    serviceDescription: service.description,
    clusterIntentLabel: service.cluster_intent_label,
    primaryCategoryName: service.primary_category_name,
    input,
  });
  return { ...built, service };
}

/**
 * Full generation: build prompt + alt, render image via Nano Banana,
 * persist to R2 + media_assets, bind to services.hero_asset_id.
 */
export async function generateServiceHero(
  siteId: string,
  serviceId: string,
): Promise<ServiceHeroGenResult> {
  const start = Date.now();
  const service = await loadService(siteId, serviceId);
  const input = await loadInput(siteId);

  const built = await buildServiceHeroPrompt({
    serviceName: service.name,
    serviceDescription: service.description,
    clusterIntentLabel: service.cluster_intent_label,
    primaryCategoryName: service.primary_category_name,
    input,
  });

  const image = await generateEditorialImage(built.prompt, built.aspectRatio);
  if (!image) {
    throw new Error(
      "service-hero: Nano Banana returned no image (check GOOGLE_AI_API_KEY + quota)",
    );
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = image.mimeType === "image/jpeg" ? "jpg" : "png";
  const r2Key = `service-hero/${siteId}/${serviceId}/${ts}.${ext}`;
  const storageUrl = await uploadBufferToR2(r2Key, image.data, image.mimeType);

  const assetId = randomUUID();
  await sql`
    INSERT INTO media_assets (
      id, business_id, storage_url, media_type, context_note,
      source, processing_stage,
      ai_analysis, metadata
    )
    VALUES (
      ${assetId},
      ${siteId},
      ${storageUrl},
      'image',
      ${built.alt},
      'ai_generated',
      'briefed',
      ${JSON.stringify({
        role: "service_hero",
        service_id: serviceId,
        service_name: service.name,
        prompt_summary: built.prompt.slice(0, 300),
      })}::jsonb,
      ${JSON.stringify({
        provenance: "ai_generated_v1",
        role: "service_hero",
        service_id: serviceId,
        service_name: service.name,
        cluster_intent_label: service.cluster_intent_label,
        primary_gcid: service.primary_gcid,
        primary_category_name: service.primary_category_name,
        model_image: "gemini-2.5-flash-image",
        model_prompt: built.meta.model,
        aspect_ratio: built.aspectRatio,
        catalog_descriptors_used: built.meta.catalog_descriptors_used,
        catalog_descriptors_missing: built.meta.catalog_descriptors_missing,
        alt_text: built.alt,
        prompt_full: built.prompt,
        generated_at: new Date().toISOString(),
      })}::jsonb
    )
  `;

  await sql`
    UPDATE services SET hero_asset_id = ${assetId}, updated_at = NOW() WHERE id = ${serviceId}
  `;

  return {
    serviceId,
    assetId,
    url: storageUrl,
    alt: built.alt,
    prompt: built.prompt,
    durationMs: Date.now() - start,
    bytesSize: image.data.byteLength,
    catalogDescriptorsUsed: built.meta.catalog_descriptors_used,
    catalogDescriptorsMissing: built.meta.catalog_descriptors_missing,
    model: built.meta.model,
  };
}
