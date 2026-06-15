/**
 * Persist generated page content as a draft row in website_content.
 *
 * Phase 1: every generation creates a NEW draft row. No automatic
 * publish; operator promotion is a separate workflow (deferred).
 *
 * Status transitions are owned by other actions (publish, archive,
 * mark-stale-on-catalog-drift). This function only writes drafts.
 */
import { sql } from "@/lib/db";
import type { PageContent } from "./types";

export interface PersistDraftArgs {
  business_id: string;
  page_key: PageContent["page_key"];
  content: PageContent;
  generated_from_catalog_version: string;
  generated_from_catalog_snapshot_id: string;
  generator_model: string;
  generator_prompt_version: string;
}

export interface PersistDraftResult {
  id: string;
  generated_at: string;
}

export async function persistDraft(args: PersistDraftArgs): Promise<PersistDraftResult> {
  const [row] = await sql`
    INSERT INTO website_content (
      business_id,
      page_key,
      status,
      content,
      generated_from_catalog_version,
      generated_from_catalog_snapshot_id,
      generator_model,
      generator_prompt_version
    )
    VALUES (
      ${args.business_id},
      ${args.page_key},
      'draft',
      ${JSON.stringify(args.content)}::jsonb,
      ${args.generated_from_catalog_version},
      ${args.generated_from_catalog_snapshot_id},
      ${args.generator_model},
      ${args.generator_prompt_version}
    )
    RETURNING id, generated_at
  `;

  return {
    id: row.id as string,
    generated_at: (row.generated_at as Date).toISOString(),
  };
}
