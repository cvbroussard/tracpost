/**
 * Admin-scoped GBP sync trigger — pulls fresh profile state from Google.
 *
 * Mirror of the subscriber-side POST /api/google/profile {action:"sync"}
 * but with admin auth so the operator can refresh the cache from the
 * step 14 drawer without needing a subscriber session.
 *
 * Per the drawer doctrine: operator observes the TracPost cache, which
 * goes stale when subscriber edits Google's UI directly or background
 * sync hasn't run. Pull-to-refresh confirms truth on demand.
 *
 * Endpoint side-effect: writes the fresh profile back to
 * businesses.gbp_profile (plus synced_at timestamp). Returns the updated
 * profile shape so the caller can refresh its local state in one round-trip.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const { syncProfileFromGoogle } = await import("@/lib/gbp/profile");
    // Operator-scoped pull: only touch the categories half of the cache.
    // Display fields are tenant-owned per the 2026-06-11 role-split audit.
    const profile = await syncProfileFromGoogle(id, "operator");
    if (!profile) {
      return NextResponse.json({ error: "Sync returned no profile" }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      syncedAt: (profile as { synced_at?: string }).synced_at ?? new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
