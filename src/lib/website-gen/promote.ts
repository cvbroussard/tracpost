/**
 * Promote a draft website_content row to published. Atomic transaction:
 *
 *   1. Mark the current published row (if any) for this (business, page)
 *      as 'archived'
 *   2. Mark the specified draft as 'published'
 *
 * Per the unique constraint `uniq_published_page_per_business`, exactly
 * one row per (business_id, page_key) can be 'published' at a time —
 * the demote-then-promote ordering preserves that constraint within the
 * transaction.
 *
 * Doesn't auto-promote — operator (or eventually tenant) makes the
 * explicit call. The current b2construct.com homepage doesn't change
 * until promote fires.
 */
import { sql } from "@/lib/db";
import type { PageKey } from "./types";

export interface PromoteResult {
  promoted_id: string;
  archived_id: string | null;
  page_key: PageKey;
  promoted_at: string;
}

/**
 * Promote the latest draft for a given (business, page) without
 * requiring the caller to know the draft id. Falls back to the most
 * recently generated draft row.
 */
export async function promoteLatestDraft(args: {
  business_id: string;
  page_key: PageKey;
}): Promise<PromoteResult> {
  const { business_id, page_key } = args;
  const [latest] = await sql`
    SELECT id FROM website_content
    WHERE business_id = ${business_id}
      AND page_key = ${page_key}
      AND status = 'draft'
    ORDER BY generated_at DESC
    LIMIT 1
  `;
  if (!latest) {
    throw new Error(
      `promote: no draft exists for business ${business_id} page ${page_key} — run Phase 1 generator first`,
    );
  }
  return promoteDraftToPublished({ business_id, draft_id: latest.id as string });
}

export async function promoteDraftToPublished(args: {
  business_id: string;
  draft_id: string;
}): Promise<PromoteResult> {
  const { business_id, draft_id } = args;

  // Sanity-check the draft exists and belongs to this business
  const [draft] = await sql`
    SELECT id, page_key, status
    FROM website_content
    WHERE id = ${draft_id} AND business_id = ${business_id}
    LIMIT 1
  `;
  if (!draft) {
    throw new Error(`promote: draft ${draft_id} not found for business ${business_id}`);
  }
  if (draft.status !== "draft") {
    throw new Error(
      `promote: row ${draft_id} has status '${draft.status}', expected 'draft'`,
    );
  }
  const pageKey = draft.page_key as PageKey;

  // Run the two-step status flip in a single transaction so the
  // partial unique index never sees two published rows simultaneously.
  await sql.transaction([
    sql`
      UPDATE website_content
      SET status = 'archived', updated_at = NOW()
      WHERE business_id = ${business_id}
        AND page_key = ${pageKey}
        AND status = 'published'
    `,
    sql`
      UPDATE website_content
      SET status = 'published', updated_at = NOW()
      WHERE id = ${draft_id}
    `,
  ]);

  const [archived] = await sql`
    SELECT id FROM website_content
    WHERE business_id = ${business_id}
      AND page_key = ${pageKey}
      AND status = 'archived'
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  return {
    promoted_id: draft_id,
    archived_id: (archived?.id as string | undefined) ?? null,
    page_key: pageKey,
    promoted_at: new Date().toISOString(),
  };
}
