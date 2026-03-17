import { sql } from "@/lib/db";
import type {
  Persona,
  CreatePersonaInput,
  UpdatePersonaInput,
  AssetPersona,
  PersonaDetection,
} from "./types";

export type { Persona, CreatePersonaInput, UpdatePersonaInput, AssetPersona, PersonaDetection };

// ── CRUD ──────────────────────────────────────────────────────────

export async function listPersonas(siteId: string): Promise<Persona[]> {
  const rows = await sql`
    SELECT * FROM personas
    WHERE site_id = ${siteId}
    ORDER BY appearance_count DESC, name ASC
  `;
  return rows as Persona[];
}

export async function getPersona(siteId: string, personaId: string): Promise<Persona | null> {
  const [row] = await sql`
    SELECT * FROM personas
    WHERE id = ${personaId} AND site_id = ${siteId}
  `;
  return (row as Persona) || null;
}

export async function createPersona(siteId: string, input: CreatePersonaInput): Promise<Persona> {
  const [row] = await sql`
    INSERT INTO personas (site_id, name, type, description, visual_cues, narrative_context, relationships)
    VALUES (
      ${siteId},
      ${input.name},
      ${input.type},
      ${input.description || null},
      ${input.visual_cues || []},
      ${input.narrative_context || null},
      ${JSON.stringify(input.relationships || {})}
    )
    RETURNING *
  `;
  return row as Persona;
}

export async function updatePersona(
  siteId: string,
  personaId: string,
  input: UpdatePersonaInput
): Promise<Persona | null> {
  // Build SET clause dynamically
  const sets: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) { sets.push("name"); values.push(input.name); }
  if (input.type !== undefined) { sets.push("type"); values.push(input.type); }
  if (input.description !== undefined) { sets.push("description"); values.push(input.description); }
  if (input.visual_cues !== undefined) { sets.push("visual_cues"); values.push(input.visual_cues); }
  if (input.narrative_context !== undefined) { sets.push("narrative_context"); values.push(input.narrative_context); }
  if (input.relationships !== undefined) { sets.push("relationships"); values.push(JSON.stringify(input.relationships)); }

  if (sets.length === 0) return getPersona(siteId, personaId);

  // Use tagged template for each field update
  // Since neon sql tagged template doesn't support dynamic column names,
  // we update all fields unconditionally from the merged state
  const existing = await getPersona(siteId, personaId);
  if (!existing) return null;

  const merged = {
    name: input.name ?? existing.name,
    type: input.type ?? existing.type,
    description: input.description ?? existing.description,
    visual_cues: input.visual_cues ?? existing.visual_cues,
    narrative_context: input.narrative_context ?? existing.narrative_context,
    relationships: input.relationships ?? existing.relationships,
  };

  const [row] = await sql`
    UPDATE personas
    SET name = ${merged.name},
        type = ${merged.type},
        description = ${merged.description},
        visual_cues = ${merged.visual_cues},
        narrative_context = ${merged.narrative_context},
        relationships = ${JSON.stringify(merged.relationships)},
        updated_at = NOW()
    WHERE id = ${personaId} AND site_id = ${siteId}
    RETURNING *
  `;
  return (row as Persona) || null;
}

export async function deletePersona(siteId: string, personaId: string): Promise<boolean> {
  const [row] = await sql`
    DELETE FROM personas
    WHERE id = ${personaId} AND site_id = ${siteId}
    RETURNING id
  `;
  return !!row;
}

// ── Asset-Persona Linking ──────────────────────────────────────────

export async function linkPersonaToAsset(
  assetId: string,
  personaId: string,
  confidence: number,
  role: AssetPersona["role"],
  detectedBy: AssetPersona["detected_by"]
): Promise<void> {
  await sql`
    INSERT INTO asset_personas (asset_id, persona_id, confidence, role, detected_by)
    VALUES (${assetId}, ${personaId}, ${confidence}, ${role}, ${detectedBy})
    ON CONFLICT (asset_id, persona_id)
    DO UPDATE SET confidence = EXCLUDED.confidence, role = EXCLUDED.role
  `;

  // Update persona appearance stats
  await sql`
    UPDATE personas
    SET appearance_count = appearance_count + 1,
        last_seen_at = NOW(),
        first_seen_at = COALESCE(first_seen_at, NOW()),
        updated_at = NOW()
    WHERE id = ${personaId}
  `;
}

export async function getAssetPersonas(assetId: string): Promise<(AssetPersona & { name: string; type: string })[]> {
  const rows = await sql`
    SELECT ap.asset_id, ap.persona_id, ap.confidence, ap.role, ap.detected_by,
           p.name, p.type
    FROM asset_personas ap
    JOIN personas p ON ap.persona_id = p.id
    WHERE ap.asset_id = ${assetId}
    ORDER BY ap.confidence DESC
  `;
  return rows as (AssetPersona & { name: string; type: string })[];
}

export async function getPersonaAssets(
  personaId: string,
  limit = 20
): Promise<{ asset_id: string; confidence: number; role: string; storage_url: string }[]> {
  const rows = await sql`
    SELECT ap.asset_id, ap.confidence, ap.role, ma.storage_url
    FROM asset_personas ap
    JOIN media_assets ma ON ap.asset_id = ma.id
    WHERE ap.persona_id = ${personaId}
    ORDER BY ma.created_at DESC
    LIMIT ${limit}
  `;
  return rows as { asset_id: string; confidence: number; role: string; storage_url: string }[];
}

// ── Vision Detection ────────────────────────────────────────────────

/**
 * Build the persona identification prompt fragment for the triage vision pass.
 * Returns null if the site has no personas defined.
 */
export async function buildPersonaPrompt(siteId: string): Promise<string | null> {
  const personas = await listPersonas(siteId);
  if (personas.length === 0) return null;

  const lines = personas.map((p) => {
    const cues = p.visual_cues.length > 0 ? ` Visual cues: ${p.visual_cues.join(", ")}.` : "";
    const desc = p.description ? ` ${p.description}.` : "";
    return `- "${p.name}" (${p.type}, id:${p.id}):${desc}${cues}`;
  });

  return `## Known Characters
The following recurring characters may appear in this image. If you recognize any, include them in your response.

${lines.join("\n")}

In your JSON response, add:
"detected_personas": [
  { "persona_id": "<id>", "persona_name": "<name>", "confidence": <0.0-1.0>, "role": "subject"|"background", "reasoning": "<why you think this is them>" }
]
If none are detected, return "detected_personas": []`;
}

/**
 * Process persona detections from the triage vision result.
 * Links detected personas to the asset and updates appearance counts.
 */
export async function processDetections(
  assetId: string,
  detections: PersonaDetection[]
): Promise<void> {
  for (const d of detections) {
    if (d.confidence < 0.5) continue; // skip low-confidence matches
    await linkPersonaToAsset(assetId, d.persona_id, d.confidence, d.role, "vision");
  }
}

/**
 * Get persona context for caption generation.
 * Returns a formatted string describing who's in the shot.
 */
export async function getPersonaCaptionContext(assetId: string): Promise<string | null> {
  const linked = await getAssetPersonas(assetId);
  if (linked.length === 0) return null;

  // Fetch full personas for narrative context
  const personaIds = linked.map((l) => l.persona_id);
  const personas = await sql`
    SELECT id, name, type, narrative_context, relationships
    FROM personas
    WHERE id = ANY(${personaIds})
  `;

  const personaMap = new Map(personas.map((p: Record<string, unknown>) => [p.id, p]));

  const parts: string[] = [];
  for (const link of linked) {
    const p = personaMap.get(link.persona_id);
    if (!p) continue;

    let line = `${p.name} (${p.type}, ${link.role})`;
    if (p.narrative_context) line += ` — ${p.narrative_context}`;

    const rels = p.relationships as Record<string, string> | null;
    if (rels && Object.keys(rels).length > 0) {
      const relStr = Object.entries(rels).map(([k, v]) => `${k}: ${v}`).join(", ");
      line += ` [${relStr}]`;
    }
    parts.push(line);
  }

  return parts.length > 0
    ? `Characters in this shot:\n${parts.join("\n")}`
    : null;
}
