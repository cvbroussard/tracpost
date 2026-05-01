/**
 * POST /api/admin/coaching/upload
 *   multipart/form-data: file (Blob), platform, nodeId
 *   Returns: { publicUrl, key }
 *
 * Server-proxied upload — the operator's browser POSTs the file to this
 * route, which buffers and uploads to R2 server-side. We avoid direct-
 * to-R2 presigned uploads here because R2 buckets require explicit CORS
 * configuration for browser PUTs, and this UI runs across multiple
 * platform.* and manage.* origins. Coaching screenshots are small
 * (typically 100KB–1MB), well under serverless body limits.
 *
 * Stable filenames + automatic Cloudflare cache purge: re-uploading the
 * same key replaces in place, and the edge serves the new bytes on the
 * next request without waiting for TTL expiry.
 *
 * Key shape: onboarding/{platform}/{nodeId}/{filename}
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { uploadBufferToR2 } from "@/lib/r2";
import { purgeCdnCache } from "@/lib/cdn";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — generous for screenshots

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data body" },
      { status: 400 }
    );
  }

  const platform = String(form.get("platform") || "");
  const nodeId = String(form.get("nodeId") || "");
  const file = form.get("file");

  if (!platform || !nodeId) {
    return NextResponse.json(
      { error: "platform and nodeId form fields required" },
      { status: 400 }
    );
  }

  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${file.size} bytes); limit is ${MAX_BYTES}` },
      { status: 413 }
    );
  }

  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: `Content type ${contentType} not allowed` },
      { status: 400 }
    );
  }

  // FormData files arrive as Blob; "name" is on File subclass.
  const rawName =
    (file as File).name ||
    `screenshot.${contentType.replace("image/", "")}`;
  const safeFilename = rawName
    .replace(/[/\\]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!safeFilename || safeFilename.startsWith(".")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const key = `onboarding/${platform}/${nodeId}/${safeFilename}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const publicUrl = await uploadBufferToR2(key, buffer, contentType);

  // Purge the edge cache — this key may have been uploaded before, in
  // which case Cloudflare would still serve the old bytes from up to
  // 24h until natural TTL expiry.
  await purgeCdnCache([publicUrl]);

  return NextResponse.json({ publicUrl, key });
}
