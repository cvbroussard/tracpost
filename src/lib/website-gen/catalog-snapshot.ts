/**
 * Capture the full generator input as a snapshot row in
 * brand_catalog_snapshots. Returns the snapshot id, which the generated
 * website_content row references for drift detection.
 *
 * The whole input state is captured — not just the catalog — so we can
 * detect drift in business_info or gbp_profile too, not just descriptors.
 */
import { sql } from "@/lib/db";
import type { GeneratorInput } from "./types";

export async function captureCatalogSnapshot(
  input: GeneratorInput,
): Promise<{ snapshot_id: string; captured_at: string }> {
  const [row] = await sql`
    INSERT INTO brand_catalog_snapshots (
      business_id,
      catalog_version,
      input_payload
    )
    VALUES (
      ${input.business_info.business_id},
      ${input.catalog.catalog_version},
      ${JSON.stringify(input)}::jsonb
    )
    RETURNING id, captured_at
  `;
  return {
    snapshot_id: row.id as string,
    captured_at: (row.captured_at as Date).toISOString(),
  };
}
