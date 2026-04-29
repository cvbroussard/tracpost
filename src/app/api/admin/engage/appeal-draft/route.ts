/**
 * POST /api/admin/engage/appeal-draft
 * Body: { eventId }
 *
 * For a negative GBP review, asks Claude to:
 *   - Identify which Google review policy category the review violates
 *     (or "no clear violation" if it's just a low-rating opinion)
 *   - Draft a professional appeal explaining the violation
 *   - Suggest supporting evidence the subscriber should attach
 *
 * Returns the draft for the operator/subscriber to copy into Google's
 * appeal form. Does NOT submit anything to Google.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const POLICY_CATEGORIES = [
  "Off-topic (review not about an actual experience)",
  "Spam or fake content",
  "Conflict of interest (competitor, ex-employee, etc.)",
  "Profanity / offensive language",
  "Hate speech / harassment / personal attack",
  "Sexually explicit content",
  "Dangerous, derogatory, or discriminatory content",
  "Impersonation",
  "Restricted content (illegal goods, alcohol, etc.)",
];

interface AppealDraft {
  hasViolation: boolean;
  category: string | null;
  rationale: string;
  appealText: string;
  evidenceSuggestions: string[];
  googleFormUrl: string;
}

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId } = await req.json().catch(() => ({}));
  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  const [evt] = await sql`
    SELECT ee.id, ee.platform, ee.event_type, ee.body, ee.permalink,
           ee.metadata, ee.occurred_at,
           ep.display_name AS person_name,
           pa.asset_name AS location_name
    FROM engagement_events ee
    LEFT JOIN engaged_persons ep ON ep.id = ee.engaged_person_id
    LEFT JOIN platform_assets pa ON pa.id = ee.platform_asset_id
    WHERE ee.id = ${eventId}
  `;

  if (!evt) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (evt.platform !== "gbp" || evt.event_type !== "review") {
    return NextResponse.json({ error: "Appeal drafts are only for Google Business Profile reviews" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  const body = (evt.body as string | null) || "";
  if (!body) {
    return NextResponse.json({ error: "Review has no text body to assess" }, { status: 400 });
  }

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 700,
    messages: [{
      role: "user",
      content: `You are helping a small business appeal a Google review. Determine whether this review violates any of Google's content policies, and if so, draft a professional appeal.

Review:
"""
${body.replace(/"""/g, '"').slice(0, 1500)}
"""

Reviewer: ${evt.person_name || "Unknown"}
Business: ${evt.location_name || "the business"}

Google's review policy categories:
${POLICY_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Be honest: most low-rating reviews are legitimate opinions and do NOT violate policy. Only flag a violation if the review clearly fits one of the categories above (e.g., contains profanity, attacks the owner personally, mentions products the business doesn't sell, etc.). A negative-but-civil review of actual service is NOT a violation.

Return ONLY JSON, no markdown:
{
  "hasViolation": true|false,
  "category": "<one of the categories above, or null>",
  "rationale": "<one sentence: why this does or does not violate policy>",
  "appealText": "<3-5 sentence appeal letter to Google addressing the violation. Empty string if no violation.>",
  "evidenceSuggestions": ["<thing to gather>", "..."]
}`,
    }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  let parsed: Partial<AppealDraft>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: "AI returned unparseable response" }, { status: 502 });
  }

  const draft: AppealDraft = {
    hasViolation: !!parsed.hasViolation,
    category: parsed.category as string | null,
    rationale: (parsed.rationale as string) || "",
    appealText: (parsed.appealText as string) || "",
    evidenceSuggestions: Array.isArray(parsed.evidenceSuggestions) ? parsed.evidenceSuggestions as string[] : [],
    googleFormUrl: "https://support.google.com/business/contact/review_remove",
  };

  return NextResponse.json(draft);
}
