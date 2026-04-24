import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { uploadBufferToR2 } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/dashboard/business-info
 * Update tenant-managed business info: phone, email, logo (file upload).
 *
 * Accepts multipart/form-data:
 *   business_phone (text)
 *   business_email (text)
 *   business_logo (file, optional)
 *   business_logo_url (text, optional — to keep existing without re-upload)
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!session.activeSiteId) {
    return NextResponse.json({ error: "No active site" }, { status: 400 });
  }

  const siteId = session.activeSiteId;
  const formData = await req.formData();
  const name = (formData.get("name") as string)?.trim() || null;
  const businessType = (formData.get("business_type") as string)?.trim() || null;
  const location = (formData.get("location") as string)?.trim() || null;
  const phone = (formData.get("business_phone") as string) || null;
  const email = (formData.get("business_email") as string) || null;
  const logoFile = formData.get("business_logo") as File | null;
  const existingLogoUrl = (formData.get("business_logo_url") as string) || null;
  const faviconFile = formData.get("business_favicon") as File | null;
  const existingFaviconUrl = (formData.get("business_favicon_url") as string) || null;
  const ogImageFile = formData.get("og_image") as File | null;
  const existingOgImageUrl = (formData.get("og_image_url") as string) || null;
  const ogTitle = (formData.get("og_title") as string)?.trim() || null;
  const ogDescription = (formData.get("og_description") as string)?.trim() || null;

  if (!name) {
    return NextResponse.json({ error: "Site name is required" }, { status: 400 });
  }

  // Validate email
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  // Helper: upload an image file to R2
  async function uploadImage(file: File, label: string, maxBytes: number): Promise<string> {
    if (!file.type.startsWith("image/") && file.type !== "image/x-icon") {
      throw new Error(`${label} must be an image`);
    }
    if (file.size > maxBytes) {
      throw new Error(`${label} must be under ${Math.floor(maxBytes / 1024)}KB`);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type.includes("png") ? "png"
      : file.type.includes("svg") ? "svg"
      : file.type.includes("webp") ? "webp"
      : file.type.includes("icon") ? "ico"
      : "jpg";
    const fname = seoFilename(label, ext);
    const key = `sites/${siteId}/branding/${fname}`;
    return uploadBufferToR2(key, buffer, file.type);
  }

  // Logo upload — square, min 250x250, bedrock R2 key
  let logoUrl: string | null = existingLogoUrl;
  if (logoFile && logoFile.size > 0) {
    try {
      if (!logoFile.type.startsWith("image/")) {
        return NextResponse.json({ error: "Logo must be an image (JPG or PNG)" }, { status: 400 });
      }
      if (logoFile.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "Logo must be under 5MB" }, { status: 400 });
      }

      const buffer = Buffer.from(await logoFile.arrayBuffer());

      // Check dimensions + convert to PNG for universal compatibility
      const sharp = (await import("sharp")).default;
      const metadata = await sharp(buffer).metadata();
      if (metadata.width && metadata.height) {
        if (metadata.width < 250 || metadata.height < 250) {
          return NextResponse.json({ error: `Logo must be at least 250×250 pixels. Got ${metadata.width}×${metadata.height}.` }, { status: 400 });
        }
        if (Math.abs(metadata.width - metadata.height) > metadata.width * 0.1) {
          return NextResponse.json({ error: `Logo should be square (1:1). Got ${metadata.width}×${metadata.height}.` }, { status: 400 });
        }
      }

      // Convert to PNG (lossless, preserves transparency, GBP-compatible)
      const pngBuffer = await sharp(buffer).png().toBuffer();
      const key = `sites/${siteId}/branding/logo.png`;
      logoUrl = await uploadBufferToR2(key, pngBuffer, "image/png");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Logo upload failed";
      if (msg.includes("250") || msg.includes("square")) {
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  // Favicon upload
  let faviconUrl: string | null = existingFaviconUrl;
  if (faviconFile && faviconFile.size > 0) {
    try {
      faviconUrl = await uploadImage(faviconFile, "favicon", 256 * 1024);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Favicon upload failed" }, { status: 400 });
    }
  }

  // OG image upload — 1200x630 recommended, landscape
  let ogImageUrl: string | null = existingOgImageUrl;
  if (ogImageFile && ogImageFile.size > 0) {
    try {
      if (!ogImageFile.type.startsWith("image/")) {
        return NextResponse.json({ error: "OG image must be an image" }, { status: 400 });
      }
      if (ogImageFile.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "OG image must be under 5MB" }, { status: 400 });
      }
      const buffer = Buffer.from(await ogImageFile.arrayBuffer());
      const sharp = (await import("sharp")).default;
      const ogBuffer = await sharp(buffer).resize(1200, 630, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer();
      const key = `sites/${siteId}/branding/og-image.jpg`;
      ogImageUrl = await uploadBufferToR2(key, ogBuffer, "image/jpeg");
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "OG image upload failed" }, { status: 400 });
    }
  }

  const brandAssets = {
    logo: logoUrl,
    favicon: faviconUrl,
    ogImage: ogImageUrl,
    ogTitle: ogTitle || name,
    ogDescription: ogDescription,
  };

  await sql`
    UPDATE sites
    SET name = ${name},
        business_type = ${businessType},
        location = ${location},
        business_phone = ${phone},
        business_email = ${email},
        business_logo = ${logoUrl},
        business_favicon = ${faviconUrl},
        brand_assets = ${JSON.stringify(brandAssets)},
        updated_at = NOW()
    WHERE id = ${siteId}
  `;

  return NextResponse.json({ success: true, business_logo: logoUrl, business_favicon: faviconUrl, og_image: ogImageUrl, brand_assets: brandAssets });
}
