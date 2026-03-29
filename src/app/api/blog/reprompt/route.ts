import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { generateEditorialImage, editEditorialImage, editWithReference } from "@/lib/image-gen/gemini";
import { uploadBufferToR2 } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";

/**
 * POST /api/blog/reprompt — Re-generate an editorial image with adjustments.
 *
 * Body: { post_id, image_url, adjustment, mode?: "new" | "edit" }
 *
 * Persists the correction at the entity level so future articles
 * automatically incorporate it.
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { post_id, image_url, adjustment, mode = "new", reference_url } = body;

  if (!post_id || !image_url || !adjustment) {
    return NextResponse.json(
      { error: "post_id, image_url, and adjustment are required" },
      { status: 400 }
    );
  }

  // Verify ownership
  const [post] = await sql`
    SELECT bp.id, bp.site_id, bp.body, bp.metadata, bp.title,
           s.image_style
    FROM blog_posts bp
    JOIN sites s ON s.id = bp.site_id
    WHERE bp.id = ${post_id} AND s.subscriber_id = ${auth.subscriberId}
  `;
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const metadata = (typeof post.metadata === "object" && post.metadata !== null
    ? post.metadata
    : {}) as Record<string, unknown>;

  const editorialImages = (metadata.editorial_images || []) as Array<{
    url: string;
    prompt: string;
    alt: string;
    entities: string[];
  }>;

  // Find the image entry by URL — may be editorial or subscriber photo
  const imageEntry = editorialImages.find((img) => img.url === image_url);
  const isEditorial = !!imageEntry;

  // Direct replace — no AI, just swap the URL
  if (mode === "replace" && reference_url) {
    const newBody = (post.body as string).replace(image_url, reference_url);
    await sql`
      UPDATE blog_posts SET body = ${newBody} WHERE id = ${post_id}
    `;
    return NextResponse.json({ success: true, new_url: reference_url });
  }

  // Generate or edit image based on mode
  let image;
  try {
    if (reference_url && mode === "edit") {
      // Reference-based edit: current image + reference + instruction
      image = await editWithReference(image_url, reference_url, adjustment);
    } else if (reference_url && mode === "new") {
      // New mode with explicit reference: use reference as inspiration
      const siteStyle = (post.image_style as string) || "";
      image = await editWithReference(reference_url, image_url, `Using the first image as the primary reference, create a production-quality version. ${adjustment}. ${siteStyle}`);
    } else if (mode === "edit") {
      // Standard edit: text instruction on single image
      image = await editEditorialImage(image_url, adjustment);
    } else if (isEditorial && imageEntry) {
      // New mode with original prompt — editorial only
      const adjustedPrompt = `${imageEntry.prompt}. IMPORTANT CORRECTION: ${adjustment}`;
      image = await generateEditorialImage(adjustedPrompt);
    } else {
      // New mode on subscriber photo — use the current image as inspiration + site style
      const siteStyle = (post.image_style as string) || "";
      const articleTitle = (post.title as string) || "";
      const richPrompt = `Generate a production-quality editorial photograph inspired by the reference image. Article: "${articleTitle}". ${adjustment}. ${siteStyle}`;
      image = await editEditorialImage(image_url, richPrompt);
      // If edit-based inspiration fails, try pure generation
      if (!image) {
        image = await generateEditorialImage(richPrompt);
      }
    }
  } catch (genErr) {
    console.error("Image gen/edit error:", genErr instanceof Error ? genErr.message : genErr);
    return NextResponse.json(
      { error: `Image ${mode} failed: ${genErr instanceof Error ? genErr.message : "unknown error"}` },
      { status: 500 }
    );
  }
  if (!image) {
    return NextResponse.json(
      { error: `Image ${mode} returned no result` },
      { status: 500 }
    );
  }

  // Upload to R2
  const ext = image.mimeType.includes("png") ? "png" : "jpg";
  const fname = seoFilename(isEditorial ? (imageEntry?.alt || adjustment) : adjustment, ext);
  const folder = isEditorial ? "editorial" : "enhanced";
  const key = `sites/${post.site_id}/${folder}/${fname}`;
  const newUrl = await uploadBufferToR2(key, image.data, image.mimeType);

  // Replace URL in post body
  const newBody = (post.body as string).replace(image_url, newUrl);

  // Update editorial_images metadata if this was an editorial image
  let updatedMetadata = metadata;
  if (isEditorial && imageEntry) {
    const updatedPrompt = mode === "new"
      ? `${imageEntry.prompt}. IMPORTANT CORRECTION: ${adjustment}`
      : imageEntry.prompt;
    const updatedImages = editorialImages.map((img) =>
      img.url === image_url
        ? { ...img, url: newUrl, prompt: updatedPrompt }
        : img
    );
    updatedMetadata = { ...metadata, editorial_images: updatedImages };
  }

  await sql`
    UPDATE blog_posts
    SET body = ${newBody}, metadata = ${JSON.stringify(updatedMetadata)}::jsonb
    WHERE id = ${post_id}
  `;

  // Only persist corrections from "new" mode — these are factual accuracy
  // corrections about the entity (e.g., "spray paint line not brush").
  // Edit mode corrections are stylistic tweaks for this specific image only.
  if (mode === "new" && isEditorial && imageEntry) {
    for (const entityKey of imageEntry.entities) {
      await sql`
        INSERT INTO image_corrections (site_id, entity_key, correction)
        VALUES (${post.site_id as string}, ${entityKey.toLowerCase()}, ${adjustment})
        ON CONFLICT (site_id, entity_key, correction) DO NOTHING
      `;
    }
  }

  return NextResponse.json({ success: true, new_url: newUrl });
}
