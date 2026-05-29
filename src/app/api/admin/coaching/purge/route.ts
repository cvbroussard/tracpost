/**
 * POST /api/admin/coaching/purge
 *   Body: { urls: string[] }
 *   Manually purge a list of asset URLs from Cloudflare's edge cache.
 *   Used as an escape hatch when something is uploaded outside the
 *   admin UI or when the auto-purge on upload didn't take.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { purgeCdnCache } from "@/lib/cdn";

interface PostBody {
  urls?: unknown;
}

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!await isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as PostBody;
  if (!Array.isArray(body.urls) || body.urls.length === 0) {
    return NextResponse.json({ error: "urls (array) required" }, { status: 400 });
  }

  const urls = body.urls.filter((u): u is string => typeof u === "string");
  if (urls.length === 0) {
    return NextResponse.json({ error: "No valid URLs provided" }, { status: 400 });
  }

  const result = await purgeCdnCache(urls);
  return NextResponse.json(result);
}
