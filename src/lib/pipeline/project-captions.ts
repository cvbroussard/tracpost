/**
 * Project caption system.
 *
 * Simple model:
 * - User captions assets manually, hitting "Generate" when they want AI help
 * - Each save rebuilds the project context snapshot (improves future generations)
 * - "Auto-caption all" bulk generates for remaining uncaptioned assets
 *
 * No modes, no thresholds. The AI gets better with every caption.
 */
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";

const anthropic = new Anthropic();

interface ProjectSnapshot {
  description: string;
  brands: string[];
  sampleCaptions: Array<{ note: string; date?: string; source: string }>;
  corrections: Array<{ ai: string; human: string }>;
  vocabulary: string[];
  updatedAt: string;
}

/**
 * Build/update the context snapshot for a project from its captioned assets.
 */
export async function buildProjectSnapshot(projectId: string): Promise<ProjectSnapshot> {
  const [project] = await sql`
    SELECT p.name, p.description, p.address, p.start_date, p.end_date
    FROM projects p WHERE p.id = ${projectId}
  `;

  if (!project) throw new Error("Project not found");

  const brandRows = await sql`
    SELECT DISTINCT b.name, b.url
    FROM brands b
    JOIN asset_brands ab ON ab.brand_id = b.id
    JOIN asset_projects ap ON ap.asset_id = ab.asset_id
    WHERE ap.project_id = ${projectId}
  `;

  const captioned = await sql`
    SELECT ma.context_note, ma.date_taken, ma.created_at, ma.metadata
    FROM media_assets ma
    JOIN asset_projects ap ON ap.asset_id = ma.id
    WHERE ap.project_id = ${projectId}
      AND ma.context_note IS NOT NULL
      AND ma.context_note != ''
    ORDER BY ma.sort_order ASC NULLS LAST
  `;

  const sampleCaptions = captioned.map((a) => {
    const meta = (a.metadata || {}) as Record<string, unknown>;
    return {
      note: a.context_note as string,
      date: a.date_taken ? new Date(a.date_taken as string).toISOString().slice(0, 10) : undefined,
      source: (meta.caption_source as string) || "manual",
    };
  });

  const corrections: Array<{ ai: string; human: string }> = [];
  for (const a of captioned) {
    const meta = (a.metadata || {}) as Record<string, unknown>;
    if (meta.caption_source === "corrected" && meta.ai_caption) {
      corrections.push({
        ai: meta.ai_caption as string,
        human: a.context_note as string,
      });
    }
  }

  const manualCaptions = sampleCaptions
    .filter((c) => c.source === "manual" || c.source === "corrected")
    .map((c) => c.note);

  const wordFreq = new Map<string, number>();
  for (const caption of manualCaptions) {
    const words = caption.toLowerCase().match(/[a-z][a-z'-]+/g) || [];
    for (const w of words) {
      if (w.length > 4) wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
    }
  }
  const vocabulary = Array.from(wordFreq.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word]) => word);

  const snapshot: ProjectSnapshot = {
    description: [
      project.name,
      project.description,
      project.address,
      project.start_date && project.end_date
        ? `${new Date(project.start_date as string).toLocaleDateString()} — ${new Date(project.end_date as string).toLocaleDateString()}`
        : null,
    ].filter(Boolean).join(" — "),
    brands: brandRows.map((b) => b.name as string),
    sampleCaptions: sampleCaptions.slice(-10),
    corrections,
    vocabulary,
    updatedAt: new Date().toISOString(),
  };

  await sql`
    UPDATE projects
    SET context_snapshot = ${JSON.stringify(snapshot)}::jsonb
    WHERE id = ${projectId}
  `;

  return snapshot;
}

/**
 * Build a site-level context snapshot for assets not in a project.
 * Uses site brand voice, all brands, and recent manual captions across the site.
 */
export async function buildSiteSnapshot(siteId: string): Promise<ProjectSnapshot> {
  const [site] = await sql`
    SELECT name, brand_voice, content_vibe, business_type, location
    FROM sites WHERE id = ${siteId}
  `;

  if (!site) throw new Error("Site not found");

  const brandRows = await sql`
    SELECT DISTINCT b.name, b.url FROM brands b WHERE b.site_id = ${siteId}
  `;

  // Get recent manual/corrected captions (not AI-generated triage captions)
  const captioned = await sql`
    SELECT ma.context_note, ma.date_taken, ma.created_at, ma.metadata
    FROM media_assets ma
    WHERE ma.site_id = ${siteId}
      AND ma.context_note IS NOT NULL
      AND ma.context_note != ''
      AND (ma.metadata->>'caption_source' IS NULL OR ma.metadata->>'caption_source' != 'ai')
      AND ma.metadata->>'context_auto_generated' IS NULL
    ORDER BY ma.sort_order DESC NULLS LAST
    LIMIT 20
  `;

  const sampleCaptions = captioned.map((a) => {
    const meta = (a.metadata || {}) as Record<string, unknown>;
    return {
      note: a.context_note as string,
      date: a.date_taken ? new Date(a.date_taken as string).toISOString().slice(0, 10) : undefined,
      source: (meta.caption_source as string) || "manual",
    };
  });

  const corrections: Array<{ ai: string; human: string }> = [];
  for (const a of captioned) {
    const meta = (a.metadata || {}) as Record<string, unknown>;
    if (meta.caption_source === "corrected" && meta.ai_caption) {
      corrections.push({ ai: meta.ai_caption as string, human: a.context_note as string });
    }
  }

  const manualCaptions = sampleCaptions.map((c) => c.note);
  const wordFreq = new Map<string, number>();
  for (const caption of manualCaptions) {
    const words = caption.toLowerCase().match(/[a-z][a-z'-]+/g) || [];
    for (const w of words) {
      if (w.length > 4) wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
    }
  }
  const vocabulary = Array.from(wordFreq.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word]) => word);

  const brandVoice = (site.brand_voice || {}) as Record<string, unknown>;
  const description = [
    site.name,
    site.business_type,
    site.location,
    site.content_vibe,
    brandVoice.tone ? `Tone: ${brandVoice.tone}` : null,
  ].filter(Boolean).join(" — ");

  return {
    description,
    brands: brandRows.map((b) => b.name as string),
    sampleCaptions: sampleCaptions.slice(-10),
    corrections,
    vocabulary,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Called when a caption is saved on a project asset.
 * Rebuilds the snapshot so future generations improve.
 * Auto-generates article prompts when conditions are met.
 */
export async function onCaptionSaved(
  assetId: string,
  projectId: string,
  isAiGenerated: boolean,
  previousCaption: string | null
): Promise<void> {
  await buildProjectSnapshot(projectId);
  await maybeGenerateArticlePrompts(projectId);
}

/**
 * Check if a project is ready for article prompt generation.
 * Conditions: playbook exists + 3+ captioned assets + no prompts yet.
 * Called from onCaptionSaved and onPlaybookSharpened.
 */
export async function maybeGenerateArticlePrompts(projectId: string): Promise<boolean> {
  const [project] = await sql`
    SELECT p.id, p.site_id, p.metadata
    FROM projects p
    WHERE p.id = ${projectId}
  `;
  if (!project) return false;

  const meta = (project.metadata || {}) as Record<string, unknown>;
  if (meta.article_prompts && (meta.article_prompts as unknown[]).length > 0) return false;

  // Check playbook exists
  const [site] = await sql`
    SELECT brand_playbook IS NOT NULL AS has_playbook
    FROM sites WHERE id = ${project.site_id}
  `;
  if (!site?.has_playbook) return false;

  // Check 3+ captioned assets
  const [count] = await sql`
    SELECT COUNT(*)::int AS c
    FROM media_assets ma
    JOIN asset_projects ap ON ap.asset_id = ma.id
    WHERE ap.project_id = ${projectId}
      AND ma.context_note IS NOT NULL AND ma.context_note != ''
      AND ma.triage_status = 'triaged'
  `;
  if ((count?.c || 0) < 3) return false;

  // All conditions met — generate prompts
  try {
    const { generateArticlePrompts } = await import("./project-blog-generator");
    await generateArticlePrompts(projectId);
    console.log(`Auto-generated article prompts for project ${projectId}`);
    return true;
  } catch (err) {
    console.error("Auto-prompt generation failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Called when a playbook is sharpened/generated on a site.
 * Checks all projects and generates article prompts for any that qualify.
 */
export async function onPlaybookSharpened(siteId: string): Promise<void> {
  const projects = await sql`SELECT id FROM projects WHERE site_id = ${siteId}`;
  for (const p of projects) {
    await maybeGenerateArticlePrompts(p.id as string);
  }
}

/**
 * Generate a caption for a single asset using its project's snapshot.
 * Returns draft text — does NOT write to DB.
 */
export async function generateCaptionForAsset(
  asset: Record<string, unknown>,
  snapshot: ProjectSnapshot
): Promise<string | null> {
  const storageUrl = asset.storage_url as string;
  const meta = (asset.metadata || {}) as Record<string, unknown>;
  const dateTaken = asset.date_taken
    ? new Date(asset.date_taken as string).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : null;
  const camera = meta.camera as string | undefined;
  const aiAnalysis = meta.ai_analysis as Record<string, unknown> | undefined;
  const sceneType = aiAnalysis?.scene_type as string | undefined;

  const examples = snapshot.sampleCaptions
    .filter((c) => c.source === "manual" || c.source === "corrected")
    .slice(-5)
    .map((c) => `[${c.date || "undated"}] ${c.note}`)
    .join("\n");

  const correctionGuide = snapshot.corrections.length > 0
    ? `\n\nIMPORTANT — Previous corrections by the user:\n${snapshot.corrections.map((c) => `- AI wrote: "${c.ai}"\n  User corrected to: "${c.human}"`).join("\n")}\nLearn from these corrections. Use the user's terminology, not generic descriptions.`
    : "";

  const prompt = `You are writing a context note for a media asset in a project documentation system.

Project: ${snapshot.description}
${snapshot.brands.length > 0 ? `Brands/materials on this project: ${snapshot.brands.join(", ")}` : ""}
${dateTaken ? `Photo date: ${dateTaken}` : ""}
${sceneType ? `Scene type: ${sceneType}` : ""}
${camera ? `Camera: ${camera}` : ""}
${snapshot.vocabulary.length > 0 ? `Domain vocabulary from this project: ${snapshot.vocabulary.join(", ")}` : ""}

${examples ? `Here are example captions written by the project owner for other photos in this same project:\n${examples}` : "No example captions available yet — write a descriptive, specific caption."}
${correctionGuide}

Write a context note for this photo in the SAME style, tone, and level of detail as the examples above.
- Be specific about what you see — materials, techniques, conditions
- Use the project's domain vocabulary, not generic terms
- Keep it concise — one or two sentences, like the examples
- Do NOT use marketing language or adjectives like "beautiful" or "stunning"
- If you're not sure what something is, describe what you see without guessing

Respond with ONLY the caption text, nothing else.`;

  try {
    const imgRes = await fetch(storageUrl, { signal: AbortSignal.timeout(10000) });
    if (!imgRes.ok) return null;
    let imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    // Always convert to JPEG for API call — PNGs from HEIC conversion are too large
    const sharp = (await import("sharp")).default;
    imgBuffer = Buffer.from(await sharp(imgBuffer)
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer());

    // If still over 4MB, resize smaller
    if (imgBuffer.length > 4 * 1024 * 1024) {
      imgBuffer = Buffer.from(await sharp(imgBuffer)
        .resize({ width: 800 })
        .jpeg({ quality: 75 })
        .toBuffer());
    }

    const base64 = imgBuffer.toString("base64");
    const mediaType = "image/jpeg";

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: prompt },
        ],
      }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : null;
    return text || null;
  } catch (err) {
    console.error("Caption generation error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Bulk generate captions for all uncaptioned assets in a project.
 * Writes directly to DB. Called from the project captions API.
 */
export async function generateAllCaptions(projectId: string): Promise<number> {
  // Build fresh snapshot
  const snapshot = await buildProjectSnapshot(projectId);

  const uncaptioned = await sql`
    SELECT ma.id, ma.storage_url, ma.media_type, ma.date_taken, ma.created_at, ma.metadata
    FROM media_assets ma
    JOIN asset_projects ap ON ap.asset_id = ma.id
    WHERE ap.project_id = ${projectId}
      AND (ma.context_note IS NULL OR ma.context_note = '')
      AND ma.triage_status = 'triaged'
    ORDER BY ma.sort_order ASC NULLS LAST
  `;

  let generated = 0;
  for (const asset of uncaptioned) {
    try {
      const caption = await generateCaptionForAsset(asset, snapshot);
      if (caption) {
        await sql`
          UPDATE media_assets
          SET context_note = ${caption},
              metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ caption_source: "ai", ai_caption: caption })}::jsonb
          WHERE id = ${asset.id}
        `;
        generated++;

        // Rebuild snapshot every 5 captions to accumulate context
        if (generated % 5 === 0) {
          await buildProjectSnapshot(projectId);
        }
      }
    } catch (err) {
      console.error(`Caption generation failed for ${asset.id}:`, err instanceof Error ? err.message : err);
    }
  }

  return generated;
}
