import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /r/{siteSlug}
 *
 * Review request redirect. Logs the click for attribution,
 * then redirects to Google's review form.
 *
 * Supports UTM params for GA4 tracking on TracPost's domain.
 * Example: /r/b2-construction?utm_source=tracpost&utm_medium=email&utm_campaign=review_request
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Find site by subdomain/slug
  const [site] = await sql`
    SELECT id, name, subdomain, gbp_profile->'metadata'->>'newReviewUri' AS review_uri,
           gbp_profile->'metadata'->>'placeId' AS place_id
    FROM sites
    WHERE subdomain = ${slug} OR LOWER(REPLACE(name, ' ', '-')) = ${slug.toLowerCase()}
    LIMIT 1
  `;

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Build review URL
  const reviewUri = (site.review_uri as string)
    || (site.place_id ? `https://search.google.com/local/writereview?placeid=${site.place_id}` : null);

  if (!reviewUri) {
    return NextResponse.json({ error: "No review link configured" }, { status: 404 });
  }

  // Log the click for analytics
  try {
    await sql`
      INSERT INTO usage_log (subscription_id, action, metadata)
      SELECT subscription_id, 'review_click', ${JSON.stringify({
        site_id: site.id,
        site_name: site.name,
        source: new URL(req.url).searchParams.get("utm_medium") || "direct",
        campaign: new URL(req.url).searchParams.get("utm_campaign") || null,
        timestamp: new Date().toISOString(),
      })}::jsonb
      FROM sites WHERE id = ${site.id}
    `;
  } catch { /* non-fatal */ }

  return NextResponse.redirect(reviewUri);
}
