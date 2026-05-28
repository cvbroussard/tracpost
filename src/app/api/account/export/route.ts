import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { buildExportArchive } from "@/lib/export";

/**
 * POST /api/account/export — Generate and return a data export download URL.
 * GET  /api/account/export?export_id=xxx — Check export status.
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  // Check for existing recent export (avoid spam)
  const [recent] = await sql`
    SELECT id, status, download_url, created_at
    FROM data_exports
    WHERE billing_account_id = ${auth.subscriptionId}
      AND created_at > NOW() - INTERVAL '1 hour'
      AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (recent?.download_url) {
    return NextResponse.json({
      export_id: recent.id,
      status: "completed",
      download_url: recent.download_url,
      message: "Recent export available. New exports can be generated after 1 hour.",
    });
  }

  // Create export record
  const [exportRow] = await sql`
    INSERT INTO data_exports (billing_account_id, status)
    VALUES (${auth.subscriptionId}, 'building')
    RETURNING id
  `;
  const exportId = exportRow.id as string;

  // Build archive (fire and forget for large exports)
  buildExportArchive(auth.subscriptionId)
    .then(async (downloadUrl) => {
      await sql`
        UPDATE data_exports
        SET status = 'completed',
            download_url = ${downloadUrl},
            expires_at = NOW() + INTERVAL '7 days'
        WHERE id = ${exportId}
      `;
    })
    .catch(async (err) => {
      console.error("Export failed:", err);
      await sql`
        UPDATE data_exports
        SET status = 'failed'
        WHERE id = ${exportId}
      `;
    });

  return NextResponse.json({
    export_id: exportId,
    status: "building",
    message: "Export is being generated. Poll GET /api/account/export?export_id=... for status.",
  });
}

export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const exportId = new URL(req.url).searchParams.get("export_id");

  if (exportId) {
    const [exp] = await sql`
      SELECT id, status, download_url, expires_at, created_at
      FROM data_exports
      WHERE id = ${exportId} AND billing_account_id = ${auth.subscriptionId}
    `;
    if (!exp) {
      return NextResponse.json({ error: "Export not found" }, { status: 404 });
    }
    return NextResponse.json(exp);
  }

  // List recent exports
  const exports = await sql`
    SELECT id, status, download_url, expires_at, created_at
    FROM data_exports
    WHERE billing_account_id = ${auth.subscriptionId}
    ORDER BY created_at DESC
    LIMIT 10
  `;
  return NextResponse.json({ exports });
}
