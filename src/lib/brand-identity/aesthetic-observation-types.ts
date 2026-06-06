/**
 * Client-safe type-only exports for the aesthetic-observation payload.
 *
 * The runtime implementation lives in aesthetic-observation.ts which imports
 * "server-only". This file carries the type contract so UI components (the
 * Phase 3 owner review surface, future consumers) can import the shape
 * without dragging the server-only marker into a client bundle.
 */

export type BrandClassVerdict = "type_a" | "type_b" | "type_c" | "type_d";

export interface DescriptorObservation<O> {
  observed: O;
  evidence: string[];
}

export interface BrandIdentityObservationPayload {
  meta: {
    research_sources_consulted: string[];
    verdict: BrandClassVerdict;
    confidence: number;
    visual_consistency_score: string;
    distinctiveness_score: string;
    alignment_with_positioning_score: string;
  };

  verbal: {
    tone:             DescriptorObservation<string[]> | null;
    lexicon:          DescriptorObservation<{ use: string[]; avoid: string[] }> | null;
    avoid:            DescriptorObservation<string[]> | null;
    voice_source:     DescriptorObservation<string> | null;
    mechanical_style: DescriptorObservation<string[]> | null;
    tagline:          DescriptorObservation<string> | null;
  };

  strategic: {
    offer:       DescriptorObservation<{ services: string[]; capabilities: string[] }> | null;
    positioning: DescriptorObservation<{ wedge: string; angles: string[]; narrative: string }> | null;
    audience:    DescriptorObservation<string[]> | null;
    proof:       DescriptorObservation<string[]> | null;
    hooks:       DescriptorObservation<string[]> | null;
    cta:         DescriptorObservation<{ action: string; style: string }> | null;
  };

  visual: {
    aesthetic:          DescriptorObservation<{ typography: string[]; layout: string[]; overall: string }> | null;
    environmental_look: DescriptorObservation<{ lighting: string; materials: string[]; mood: string }> | null;
    subject_style:      DescriptorObservation<{ photographic_treatment: string; subjects_shown: string[]; framing: string }> | null;
    palette:            DescriptorObservation<{ colors: string[]; usage: string }> | null;
    logo:               DescriptorObservation<{ mark: string; usage: string }> | null;
    do_not_show:        null;
  };

  sonic: {
    voiceover_character: DescriptorObservation<string> | null;
    music_mood:          DescriptorObservation<string> | null;
    sfx_style:           DescriptorObservation<string> | null;
    pronunciation:       DescriptorObservation<string> | null;
  };

  distinctive_elements_vs_category_defaults: string[];
  gaps_and_absences: string[];
}
