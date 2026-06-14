/**
 * Use-case helper: build a composite grid image of GBP photos for PPA's
 * visual observation. Pulls up to MAX_GRID_PHOTOS rows from gbp_photo_sync
 * (owner-published, synced from Google's GBP Media API), fetches the bytes,
 * arranges them in a 2-row × 5-col layout via sharp, and persists as a
 * single PNG in R2.
 *
 * Why a grid instead of N individual images:
 *  - The multimodal call sees ONE image rather than 4-10 base64 blobs →
 *    smaller payload + lower latency
 *  - The LLM can observe cross-photo patterns (variety, coherence, repeated
 *    subjects) at a glance — the visual portfolio shape, not just isolated
 *    samples
 *  - Per-image label baked into the composite as a small caption
 *
 * Returns null when no synced photos exist for the business (gracefully —
 * caller falls back to website screenshot + brand logo only).
 */
import sharp from "sharp";
import { sql } from "@/lib/db";
import { persistCapture } from "./persist";
import { CaptureError } from "./types";

const MAX_GRID_PHOTOS = 10;
const CELL_W = 400;
const CELL_H = 300;
const COLS = 5;
const ROWS = 2;
const LABEL_H = 18;
const PADDING = 8;

// Grid composite covers the brand's "rest of the portfolio" — visual variety
// across exterior, interior, and at-work contexts. COVER and LOGO are
// deliberately EXCLUDED: those are special single-photo roles surfaced as
// their own labeled images in the PPA payload (cross-surface comparison
// signal vs website screenshot + business_logo). Including them in the grid
// too would double-payload them.
const PRIORITY_GBP_CATEGORIES = [
  "EXTERIOR",
  "INTERIOR",
  "PRODUCT",
  "AT_WORK",
  "FOOD_AND_DRINK",
  "MENU",
  "COMMON_AREA",
  "ROOMS",
  "TEAMS",
  "ADDITIONAL",
] as const;

export interface GbpPhotosGridResult {
  url: string;
  capturedAt: string;
  durationMs: number;
  bytesSize: number;
  photoCount: number;
  categoriesIncluded: string[];
}

export async function captureGbpPhotosGrid(
  businessId: string,
): Promise<GbpPhotosGridResult | null> {
  const start = Date.now();

  const [biz] = await sql`SELECT id FROM businesses WHERE id = ${businessId} LIMIT 1`;
  if (!biz) {
    throw new CaptureError("invalid_request", `business ${businessId} not found`);
  }

  const photoRows = await sql`
    SELECT gbp_media_url, category
    FROM gbp_photo_sync
    WHERE business_id = ${businessId}
      AND gbp_media_url IS NOT NULL
      AND category = ANY(${PRIORITY_GBP_CATEGORIES as unknown as string[]})
    ORDER BY
      array_position(${PRIORITY_GBP_CATEGORIES as unknown as string[]}, category),
      synced_at DESC NULLS LAST
    LIMIT ${MAX_GRID_PHOTOS}
  `;

  if (photoRows.length === 0) return null;

  // Fetch + decode each photo to a normalized cell-sized buffer in parallel.
  // sharp.resize + flatten ensures consistent dimensions and removes alpha so
  // the composite cell layout is deterministic.
  const cells = await Promise.all(
    photoRows.map(async (row) => {
      const url = row.gbp_media_url as string;
      const category = row.category as string;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const resized = await sharp(buf)
          .resize(CELL_W, CELL_H, { fit: "cover", position: "centre" })
          .flatten({ background: "#000000" })
          .png()
          .toBuffer();
        return { buf: resized, category, ok: true as const };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Synthesize a placeholder cell so the grid layout stays uniform.
        // Logs the failure for debugging — gbp_media_urls do expire.
        console.warn(`[gbp-photos-grid] failed to fetch ${url}: ${msg}`);
        const placeholder = await sharp({
          create: {
            width: CELL_W,
            height: CELL_H,
            channels: 3,
            background: { r: 24, g: 24, b: 28 },
          },
        })
          .png()
          .toBuffer();
        return { buf: placeholder, category, ok: false as const };
      }
    }),
  );

  const totalCols = COLS;
  const totalRows = Math.min(ROWS, Math.ceil(cells.length / COLS));
  const canvasW = totalCols * (CELL_W + PADDING) + PADDING;
  const canvasH = totalRows * (CELL_H + LABEL_H + PADDING) + PADDING;

  // Build SVG labels — sharp composites SVG buffers cleanly without external
  // font installs. One SVG per cell holds just the category caption.
  const composites: sharp.OverlayOptions[] = [];
  cells.forEach((cell, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    if (row >= totalRows) return;
    const x = PADDING + col * (CELL_W + PADDING);
    const y = PADDING + row * (CELL_H + LABEL_H + PADDING);
    composites.push({ input: cell.buf, top: y, left: x });

    const labelSvg = Buffer.from(
      `<svg width="${CELL_W}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">
         <rect width="100%" height="100%" fill="#0b0b0e"/>
         <text x="6" y="13" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#cbd0d8" font-weight="600">${escapeXml(cell.category)}${cell.ok ? "" : " (unavailable)"}</text>
       </svg>`,
    );
    composites.push({ input: labelSvg, top: y + CELL_H, left: x });
  });

  const compositeBuf = await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 3,
      background: { r: 11, g: 11, b: 14 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  const generatedAt = new Date().toISOString();
  const persisted = await persistCapture(
    {
      format: "png",
      bytes: compositeBuf,
      meta: {
        capturedAt: generatedAt,
        durationMs: Date.now() - start,
        viewport: { width: canvasW, height: canvasH },
        sourceUrl: undefined,
        bytesSize: compositeBuf.byteLength,
      },
    },
    { context: "gbp_photos_grid", businessId },
  );

  await sql`
    UPDATE businesses
    SET gbp_photos_grid = ${persisted.url},
        gbp_photos_grid_at = NOW()
    WHERE id = ${businessId}
  `;

  const categoriesIncluded = Array.from(new Set(cells.map((c) => c.category)));
  return {
    url: persisted.url,
    capturedAt: generatedAt,
    durationMs: Date.now() - start,
    bytesSize: compositeBuf.byteLength,
    photoCount: cells.length,
    categoriesIncluded,
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
