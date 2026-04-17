/**
 * Before/after composite — side-by-side or carousel-ready.
 *
 * Takes two asset URLs (earliest + latest in a project), resizes
 * to matching dimensions, concatenates horizontally with a thin
 * divider, and optionally adds BEFORE/AFTER text labels.
 */
import sharp from "sharp";

interface CompositeOpts {
  beforeUrl: string;
  afterUrl: string;
  outputWidth?: number;
  dividerWidth?: number;
  labels?: boolean;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function labelSvg(text: string, width: number, height: number): Buffer {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${height - 48}" width="${width}" height="48" fill="rgba(0,0,0,0.6)" />
      <text x="${width / 2}" y="${height - 16}"
            font-family="system-ui, sans-serif"
            font-size="20" font-weight="bold"
            fill="#ffffff" text-anchor="middle">
        ${text}
      </text>
    </svg>
  `;
  return Buffer.from(svg);
}

export async function createBeforeAfterComposite(
  opts: CompositeOpts,
): Promise<Buffer> {
  const outputWidth = opts.outputWidth || 2160;
  const dividerWidth = opts.dividerWidth || 4;
  const halfWidth = Math.floor((outputWidth - dividerWidth) / 2);
  const targetHeight = Math.floor(halfWidth * 1.25); // 4:5 each half

  const [beforeBuf, afterBuf] = await Promise.all([
    fetchBuffer(opts.beforeUrl),
    fetchBuffer(opts.afterUrl),
  ]);

  let beforeImg = await sharp(beforeBuf)
    .resize(halfWidth, targetHeight, { fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: 90 })
    .toBuffer();

  let afterImg = await sharp(afterBuf)
    .resize(halfWidth, targetHeight, { fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: 90 })
    .toBuffer();

  // Add labels if requested
  if (opts.labels !== false) {
    const beforeLabel = labelSvg("BEFORE", halfWidth, targetHeight);
    beforeImg = await sharp(beforeImg)
      .composite([{ input: beforeLabel, top: 0, left: 0 }])
      .toBuffer();

    const afterLabel = labelSvg("AFTER", halfWidth, targetHeight);
    afterImg = await sharp(afterImg)
      .composite([{ input: afterLabel, top: 0, left: 0 }])
      .toBuffer();
  }

  // Create divider
  const divider = await sharp({
    create: {
      width: dividerWidth,
      height: targetHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .jpeg()
    .toBuffer();

  // Concatenate: before | divider | after
  const composite = await sharp({
    create: {
      width: outputWidth,
      height: targetHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: beforeImg, left: 0, top: 0 },
      { input: divider, left: halfWidth, top: 0 },
      { input: afterImg, left: halfWidth + dividerWidth, top: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();

  return composite;
}

/**
 * Auto-detect before/after pair from a project's assets.
 * Returns the earliest and latest photos by date_taken with
 * quality_score > threshold, matching scene types if possible.
 */
export async function detectBeforeAfterPair(
  projectId: string,
): Promise<{ beforeUrl: string; afterUrl: string } | null> {
  const { sql } = await import("@/lib/db");

  const assets = await sql`
    SELECT ma.storage_url, ma.date_taken, ma.quality_score,
           ma.ai_analysis->>'scene_type' AS scene_type
    FROM asset_projects ap
    JOIN media_assets ma ON ma.id = ap.asset_id
    WHERE ap.project_id = ${projectId}
      AND ma.triage_status IN ('triaged', 'scheduled', 'consumed')
      AND ma.media_type LIKE 'image%'
      AND ma.quality_score >= 0.5
    ORDER BY ma.date_taken ASC NULLS LAST, ma.created_at ASC
  `;

  if (assets.length < 2) return null;

  const beforeAsset = assets[0];
  const afterAsset = assets[assets.length - 1];

  return {
    beforeUrl: String(beforeAsset.storage_url),
    afterUrl: String(afterAsset.storage_url),
  };
}
