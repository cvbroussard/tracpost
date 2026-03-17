/**
 * Cast of Characters — recurring personas in a site's content.
 *
 * Personas are people, pets, places, or products that appear across
 * multiple assets. The pipeline uses them to auto-tag assets via
 * vision and weave character narratives into captions.
 */

export type PersonaType = "pet" | "person" | "place" | "product";

export interface Persona {
  id: string;
  site_id: string;
  name: string;
  type: PersonaType;
  description: string | null;
  visual_cues: string[];
  narrative_context: string | null;
  relationships: Record<string, string>;
  appearance_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePersonaInput {
  name: string;
  type: PersonaType;
  description?: string;
  visual_cues?: string[];
  narrative_context?: string;
  relationships?: Record<string, string>;
}

export interface UpdatePersonaInput {
  name?: string;
  type?: PersonaType;
  description?: string;
  visual_cues?: string[];
  narrative_context?: string;
  relationships?: Record<string, string>;
}

export interface AssetPersona {
  asset_id: string;
  persona_id: string;
  confidence: number;
  role: "subject" | "background" | "mentioned";
  detected_by: "vision" | "manual" | "context";
}

/** Vision detection result for a single persona match */
export interface PersonaDetection {
  persona_id: string;
  persona_name: string;
  confidence: number;
  role: "subject" | "background";
  reasoning: string;
}
