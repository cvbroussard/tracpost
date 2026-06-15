/**
 * Zod schemas for runtime validation of the generator's LLM output.
 *
 * Used by the orchestrator: Sonnet's tool-use response is parsed against
 * these schemas. On validation failure, the orchestrator re-prompts with
 * the validation error attached as context (single retry).
 */
import { z } from "zod";

export const HeroSectionSchema = z.object({
  type: z.literal("hero"),
  tagline: z.string().nullable(),
  headline: z.string().min(1),
  subhead: z.string().nullable(),
  primary_cta: z.object({
    text: z.string().min(1),
    href: z.string().min(1),
  }),
  secondary_cta: z
    .object({
      text: z.string().min(1),
      href: z.string().min(1),
    })
    .nullable(),
  hero_image: z
    .object({
      asset_id: z.string().nullable(),
      url: z.string().nullable(),
      alt: z.string(),
    })
    .nullable(),
});

export const PageContentEnvelopeSchema = z.object({
  page_key: z.enum(["home", "about", "services", "blog", "projects", "contact"]),
  schema_version: z.string(),
  sections: z.array(z.any()).min(1), // section-specific schemas validated separately
  metadata: z.object({
    seo: z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      og_image_asset_id: z.string().nullable(),
    }),
    canonical_path: z.string().min(1),
  }),
});

// Schemas for additional section types added as they're built out
// (Phase 1 only ships hero).
