/**
 * Progressive project caption pipeline.
 *
 * Phase 1 (seeding): User writes manual captions. No AI generation.
 * Phase 2 (supervised): AI generates one caption at a time, waits for user action.
 * Phase 3 (autopilot): AI captions all uncaptioned assets freely.
 *
 * The context snapshot accumulates with each caption, improving quality over time.
 */
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";

const anthropic = new Anthropic();
const SEED_THRESHOLD = 3;

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

  // Get brands associated with this project's assets
  const brandRows = await sql`
    SELECT DISTINCT b.name, b.url
    FROM brands b
    JOIN asset_brands ab ON ab.brand_id = b.id
    JOIN asset_projects ap ON ap.asset_id = ab.asset_id
    WHERE ap.project_id = ${projectId}
  `;

  // Get all captioned assets in this project, ordered by date
  const captioned = await sql`
    SELECT ma.context_note, ma.date_taken, ma.created_at, ma.metadata
    FROM media_assets ma
    JOIN asset_projects ap ON ap.asset_id = ma.id
    WHERE ap.project_id = ${projectId}
      AND ma.context_note IS NOT NULL
      AND ma.context_note != ''
    ORDER BY COALESCE(ma.date_taken, ma.created_at) ASC
  `;

  const sampleCaptions = captioned.map((a) => {
    const meta = (a.metadata || {}) as Record<string, unknown>;
    return {
      note: a.context_note as string,
      date: a.date_taken ? new Date(a.date_taken as string).toISOString().slice(0, 10) : undefined,
      source: (meta.caption_source as string) || "manual",
    };
  });

  // Extract corrections (where AI caption was replaced)
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

  // Extract unique vocabulary from manual/corrected captions
  const manualCaptions = sampleCaptions
    .filter((c) => c.source === "manual" || c.source === "corrected")
    .map((c) => c.note);

  // Find domain-specific terms (words that appear in manual captions but are uncommon)
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
    sampleCaptions: sampleCaptions.slice(-10), // Keep last 10 for context window
    corrections,
    vocabulary,
    updatedAt: new Date().toISOString(),
  };

  // Store snapshot on the project
  await sql`
    UPDATE projects
    SET context_snapshot = ${JSON.stringify(snapshot)}::jsonb
    WHERE id = ${projectId}
  `;

  return snapshot;
}

/**
 * Record a manual caption save — updates snapshot and advances caption mode.
 * Called from the asset PATCH API when a project asset's caption changes.
 */
export async function onCaptionSaved(
  assetId: string,
  projectId: string,
  isAiGenerated: boolean,
  previousCaption: string | null
): Promise<{ modeChanged: boolean; newMode: string }> {
  const [project] = await sql`
    SELECT caption_mode, manual_caption_count FROM projects WHERE id = ${projectId}
  `;

  if (!project) return { modeChanged: false, newMode: "seeding" };

  let mode = project.caption_mode as string;
  let count = (project.manual_caption_count as number) || 0;

  if (!isAiGenerated) {
    count++;

    // Advance from seeding → supervised at threshold
    if (mode === "seeding" && count >= SEED_THRESHOLD) {
      mode = "supervised";
      await sql`
        UPDATE projects SET caption_mode = 'supervised', manual_caption_count = ${count}
        WHERE id = ${projectId}
      `;
      await buildProjectSnapshot(projectId);
      return { modeChanged: true, newMode: "supervised" };
    }

    await sql`
      UPDATE projects SET manual_caption_count = ${count}
      WHERE id = ${projectId}
    `;
  }

  // Rebuild snapshot on every save (improves future AI generations)
  await buildProjectSnapshot(projectId);

  return { modeChanged: false, newMode: mode };
}

/**
 * Generate a draft caption for the next uncaptioned asset in a project.
 * Returns the caption text and asset ID WITHOUT writing to DB.
 * The caption is held as an unsaved draft until the user saves.
 */
export async function generateNextCaption(projectId: string): Promise<{ assetId: string; caption: string } | null> {
  const [project] = await sql`
    SELECT caption_mode, context_snapshot FROM projects WHERE id = ${projectId}
  `;

  if (!project) return null;
  const mode = project.caption_mode as string;
  if (mode === "seeding") return null;

  const snapshot = (project.context_snapshot || {}) as ProjectSnapshot;

  // Find the next uncaptioned asset in this project
  const [nextAsset] = await sql`
    SELECT ma.id, ma.storage_url, ma.media_type, ma.date_taken, ma.created_at, ma.metadata
    FROM media_assets ma
    JOIN asset_projects ap ON ap.asset_id = ma.id
    WHERE ap.project_id = ${projectId}
      AND (ma.context_note IS NULL OR ma.context_note = '')
      AND ma.triage_status = 'triaged'
    ORDER BY COALESCE(ma.date_taken, ma.created_at) ASC
    LIMIT 1
  `;

  if (!nextAsset) return null;

  const caption = await generateCaptionForAsset(nextAsset, snapshot);
  if (!caption) return null;

  return { assetId: nextAsset.id as string, caption };
}

/**
 * Generate captions for ALL uncaptioned assets in a project (autopilot mode).
 */
export async function generateAllCaptions(projectId: string): Promise<number> {
  const [project] = await sql`
    SELECT caption_mode, context_snapshot FROM projects WHERE id = ${projectId}
  `;

  if (!project || project.caption_mode !== "autopilot") return 0;

  const snapshot = (project.context_snapshot || {}) as ProjectSnapshot;

  const uncaptioned = await sql`
    SELECT ma.id, ma.storage_url, ma.media_type, ma.date_taken, ma.created_at, ma.metadata
    FROM media_assets ma
    JOIN asset_projects ap ON ap.asset_id = ma.id
    WHERE ap.project_id = ${projectId}
      AND (ma.context_note IS NULL OR ma.context_note = '')
      AND ma.triage_status = 'triaged'
    ORDER BY COALESCE(ma.date_taken, ma.created_at) ASC
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

/**
 * Generate a caption for a single asset using the project snapshot.
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

  // Build few-shot examples from manual/corrected captions
  const examples = snapshot.sampleCaptions
    .filter((c) => c.source === "manual" || c.source === "corrected")
    .slice(-5)
    .map((c) => `[${c.date || "undated"}] ${c.note}`)
    .join("\n");

  // Build correction guidance
  const correctionGuide = snapshot.corrections.length > 0
    ? `\n\nIMPORTANT — Previous corrections by the user:\n${snapshot.corrections.map((c) => `- AI wrote: "${c.ai}"\n  User corrected to: "${c.human}"`).join("\n")}\nLearn from these corrections. Use the user's terminology, not generic descriptions.`
    : "";

  // Build the prompt
  const prompt = `You are writing a context note for a media asset in a construction/renovation project documentation system.

Project: ${snapshot.description}
${snapshot.brands.length > 0 ? `Brands/materials on this project: ${snapshot.brands.join(", ")}` : ""}
${dateTaken ? `Photo date: ${dateTaken}` : ""}
${sceneType ? `Scene type: ${sceneType}` : ""}
${camera ? `Camera: ${camera}` : ""}
${snapshot.vocabulary.length > 0 ? `Domain vocabulary from this project: ${snapshot.vocabulary.join(", ")}` : ""}

Here are example captions written by the project owner for other photos in this same project:
${examples}
${correctionGuide}

Write a context note for this photo in the SAME style, tone, and level of detail as the examples above.
- Be specific about what you see — materials, techniques, conditions
- Use the project's domain vocabulary, not generic terms
- Keep it concise — one or two sentences, like the examples
- Do NOT use marketing language or adjectives like "beautiful" or "stunning"
- If you're not sure what something is, describe what you see without guessing

Respond with ONLY the caption text, nothing else.`;

  try {
    // Fetch image for vision
    const imgRes = await fetch(storageUrl, { signal: AbortSignal.timeout(10000) });
    if (!imgRes.ok) return null;
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const base64 = imgBuffer.toString("base64");
    const mediaType = storageUrl.endsWith(".png") ? "image/png" : "image/jpeg";

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
