/**
 * PDF processing — register PDF as a media_asset + extract page thumbnails.
 *
 * Flow:
 * 1. PDF already on R2 (uploaded via /api/assets)
 * 2. Create a media_asset for the PDF itself (media_type = 'pdf')
 * 3. Extract page count with pdf-lib
 * 4. Render each page as PNG with pdf-to-img
 * 5. Upload each page thumbnail to R2
 * 6. Create a media_asset per page linking back to the parent PDF
 */
import { PDFDocument } from "pdf-lib";
import { sql } from "@/lib/db";
import { uploadBufferToR2 } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";

/**
 * Process a PDF: create the parent PDF asset and extract page thumbnails.
 * Returns the IDs of all created assets (parent PDF first, then thumbnails).
 */
export async function processPdf(
  pdfUrl: string,
  siteId: string,
  projectId: string | null,
  contextNote: string | null
): Promise<string[]> {
  // Fetch PDF
  const res = await fetch(pdfUrl, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);
  const pdfBuffer = Buffer.from(await res.arrayBuffer());

  // Get page count
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();
  console.log(`PDF processing: ${pageCount} pages from ${pdfUrl}`);

  const date = new Date().toISOString().slice(0, 10);
  const allAssetIds: string[] = [];

  // Base sort_order — current epoch seconds. Thumbnails get base + pageNum * 0.001
  // so they sort in page order while staying close to upload time.
  const baseSortOrder = Math.floor(Date.now() / 1000);

  // 1. Create parent PDF asset (sort just above the first page thumbnail)
  const parentMetadata: Record<string, unknown> = {
    pdf_total_pages: pageCount,
  };
  if (projectId) {
    parentMetadata.pending_project_id = projectId;
  }

  const [parentAsset] = await sql`
    INSERT INTO media_assets (
      business_id, storage_url, media_type, context_note,
      source, processing_stage, metadata, sort_order
    )
    VALUES (
      ${siteId}, ${pdfUrl}, 'pdf',
      ${contextNote || `${pageCount}-page document`},
      'pdf', 'onboarded',
      ${JSON.stringify(parentMetadata)},
      ${baseSortOrder + (pageCount + 1) * 0.001}
    )
    RETURNING id
  `;
  const parentId = parentAsset.id as string;
  allAssetIds.push(parentId);

  // Link parent PDF to project immediately (parent is 'onboarded', won't go through pipeline)
  if (projectId) {
    await sql`
      INSERT INTO asset_projects (asset_id, project_id)
      VALUES (${parentId}, ${projectId})
      ON CONFLICT DO NOTHING
    `;
  }

  // 2. Render each page as PNG thumbnail
  // pdf-to-img is ESM-only, dynamic import
  const { pdf } = await import("pdf-to-img");

  let pageNum = 0;
  for await (const image of await pdf(pdfBuffer, { scale: 2 })) {
    pageNum++;
    const imgBuffer = Buffer.from(image);

    const fname = seoFilename(
      contextNote ? `${contextNote} page ${pageNum}` : `document page ${pageNum}`,
      "png"
    );
    const key = `sites/${siteId}/${date}/${fname}`;
    const thumbnailUrl = await uploadBufferToR2(key, imgBuffer, "image/png");

    const pageNote = contextNote
      ? `${contextNote} — page ${pageNum} of ${pageCount}`
      : `Document page ${pageNum} of ${pageCount}`;

    const thumbMetadata: Record<string, unknown> = {
      source_pdf_url: pdfUrl,
      source_pdf_asset_id: parentId,
      pdf_page: pageNum,
      pdf_total_pages: pageCount,
    };

    if (projectId) {
      thumbMetadata.pending_project_id = projectId;
    }

    // sort_order: page 1 highest, page N lowest, all just below the parent PDF
    const pageSortOrder = baseSortOrder + (pageCount - pageNum + 1) * 0.001;

    const [asset] = await sql`
      INSERT INTO media_assets (
        business_id, storage_url, media_type, context_note,
        source, processing_stage, metadata, sort_order
      )
      VALUES (
        ${siteId}, ${thumbnailUrl}, 'image',
        ${pageNote}, 'pdf', 'onboarded',
        ${JSON.stringify(thumbMetadata)},
        ${pageSortOrder}
      )
      RETURNING id
    `;

    allAssetIds.push(asset.id as string);
  }

  console.log(`PDF processed: parent + ${pageCount} page thumbnails created`);
  return allAssetIds;
}
