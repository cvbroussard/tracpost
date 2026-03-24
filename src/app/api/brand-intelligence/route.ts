import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import {
  startResearch,
  selectAnglesAndGenerateHooks,
  rateHooksAndFinalize,
  getWizardState,
  getPlaybook,
  getHookBank,
} from "@/lib/brand-intelligence";
import type { OnboardingInput, RatedHook } from "@/lib/brand-intelligence";
import { autoGeneratePlaybook, refinePlaybook } from "@/lib/brand-intelligence/auto-generate";

/**
 * POST /api/brand-intelligence — Multi-action endpoint for the brand wizard.
 *
 * Actions:
 *   start_research  — Submit onboarding input, kick off AI research
 *   select_angles   — Select brand angles, generate hooks
 *   rate_hooks      — Submit hook ratings, finalize playbook
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const body = await req.json();
    const { action, site_id } = body;

    if (!site_id || !action) {
      return NextResponse.json(
        { error: "site_id and action are required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const [site] = await sql`
      SELECT id FROM sites
      WHERE id = ${site_id} AND subscriber_id = ${auth.subscriberId}
    `;
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    switch (action) {
      case "auto_generate": {
        const { business_type, location, website_url } = body;
        if (!business_type) {
          return NextResponse.json({ error: "business_type required" }, { status: 400 });
        }
        const playbook = await autoGeneratePlaybook(site_id, business_type, location, website_url);
        return NextResponse.json({ playbook, phase: "complete" });
      }

      case "refine": {
        const { angle } = body;
        if (!angle) {
          return NextResponse.json({ error: "angle is required" }, { status: 400 });
        }
        const playbook = await refinePlaybook(site_id, angle);
        return NextResponse.json({ playbook, phase: "complete" });
      }

      case "start_research": {
        const input = body.input as OnboardingInput;
        if (!input?.step1 || !input?.step2 || !input?.step3) {
          return NextResponse.json(
            { error: "Complete onboarding input required (step1, step2, step3)" },
            { status: 400 }
          );
        }
        const result = await startResearch(site_id, input);
        return NextResponse.json({
          phase: "angles",
          angles: result.angles,
        });
      }

      case "select_angles": {
        const indices = body.selected_indices as number[];
        if (!Array.isArray(indices) || indices.length === 0) {
          return NextResponse.json(
            { error: "selected_indices array required" },
            { status: 400 }
          );
        }
        const result = await selectAnglesAndGenerateHooks(site_id, indices);
        return NextResponse.json({
          phase: "hooks",
          hooks: result.hooks,
        });
      }

      case "rate_hooks": {
        const ratedHooks = body.rated_hooks as RatedHook[];
        if (!Array.isArray(ratedHooks) || ratedHooks.length === 0) {
          return NextResponse.json(
            { error: "rated_hooks array required" },
            { status: 400 }
          );
        }
        const result = await rateHooksAndFinalize(site_id, ratedHooks);
        return NextResponse.json({
          phase: "complete",
          playbook: result.playbook,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    console.error("Brand intelligence error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/brand-intelligence?site_id=xxx — Get wizard state or completed playbook.
 *
 * Query params:
 *   site_id  — required
 *   hooks    — if "true", return hook bank instead
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  // Verify ownership
  const [site] = await sql`
    SELECT id FROM sites
    WHERE id = ${siteId} AND subscriber_id = ${auth.subscriberId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  try {
    // Hook bank request
    if (req.nextUrl.searchParams.get("hooks") === "true") {
      const hooks = await getHookBank(siteId);
      return NextResponse.json({ hooks });
    }

    // Check for completed playbook first
    const playbook = await getPlaybook(siteId);
    if (playbook) {
      return NextResponse.json({ phase: "complete", playbook });
    }

    // Check for in-progress wizard
    const wizardState = await getWizardState(siteId);
    if (wizardState) {
      return NextResponse.json({
        phase: wizardState.phase,
        angles: wizardState.generatedAngles,
        selectedAngleIndices: wizardState.selectedAngleIndices,
        hooks: wizardState.generatedHooks,
      });
    }

    // Nothing started yet
    return NextResponse.json({ phase: "onboarding" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
