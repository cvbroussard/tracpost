import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { startDiscovery, runBlogImport } from "@/lib/blog-import";
import type { DiscoveredPost } from "@/lib/blog-import";

/**
 * GET /api/blog/import?import_id=xxx — Poll import status.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const importId = new URL(req.url).searchParams.get("import_id");
  if (!importId) {
    return NextResponse.json({ error: "import_id required" }, { status: 400 });
  }

  const [job] = await sql`
    SELECT bi.id, bi.business_id, bi.source_url, bi.status,
           bi.discovered_urls, bi.imported_count, bi.total_count,
           bi.errors, bi.current_post, bi.created_at
    FROM blog_imports bi
    JOIN businesses s ON s.id = bi.business_id
    WHERE bi.id = ${importId} AND s.billing_account_id = ${auth.subscriptionId}
  `;

  if (!job) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}

/**
 * POST /api/blog/import — Discover, start, or check import status.
 *
 * Actions:
 * - { action: "discover", site_id, blog_url } — Scan blog for posts
 * - { action: "start", import_id, selected_urls? } — Begin importing
 * - { action: "status", import_id } — Same as GET
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { action } = body;

  if (action === "discover") {
    const { site_id, blog_url } = body;
    if (!site_id || !blog_url) {
      return NextResponse.json(
        { error: "site_id and blog_url required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const [site] = await sql`
      SELECT id FROM businesses WHERE id = ${site_id} AND billing_account_id = ${auth.subscriptionId}
    `;
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    try {
      const { importId, posts } = await startDiscovery(site_id, blog_url);
      return NextResponse.json({ import_id: importId, posts });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Discovery failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (action === "start") {
    const { import_id, selected_urls } = body;
    if (!import_id) {
      return NextResponse.json({ error: "import_id required" }, { status: 400 });
    }

    // Verify ownership
    const [job] = await sql`
      SELECT bi.id, bi.business_id, bi.discovered_urls
      FROM blog_imports bi
      JOIN businesses s ON s.id = bi.business_id
      WHERE bi.id = ${import_id} AND s.billing_account_id = ${auth.subscriptionId}
    `;
    if (!job) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    // If selected_urls provided, filter discovered_urls
    if (selected_urls && Array.isArray(selected_urls)) {
      const selectedSet = new Set(selected_urls);
      const filtered = (job.discovered_urls as DiscoveredPost[]).filter(
        (p) => selectedSet.has(p.url)
      );
      await sql`
        UPDATE blog_imports
        SET discovered_urls = ${JSON.stringify(filtered)},
            total_count = ${filtered.length},
            updated_at = NOW()
        WHERE id = ${import_id}
      `;
    }

    // Fire and forget — the import runs in the background
    runBlogImport(import_id).catch((err) => {
      console.error(`Blog import ${import_id} failed:`, err);
    });

    return NextResponse.json({ status: "started", import_id });
  }

  if (action === "status") {
    const { import_id } = body;
    if (!import_id) {
      return NextResponse.json({ error: "import_id required" }, { status: 400 });
    }

    const [job] = await sql`
      SELECT bi.id, bi.business_id, bi.source_url, bi.status,
             bi.discovered_urls, bi.imported_count, bi.total_count,
             bi.errors, bi.current_post, bi.created_at
      FROM blog_imports bi
      JOIN businesses s ON s.id = bi.business_id
      WHERE bi.id = ${import_id} AND s.billing_account_id = ${auth.subscriptionId}
    `;

    if (!job) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    return NextResponse.json(job);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
