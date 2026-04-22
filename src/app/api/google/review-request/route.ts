import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/google/review-request
 * Sends a review request email to a customer.
 * Body: { site_id, email, review_url }
 */
export async function POST(req: NextRequest) {
  const { site_id, email, review_url } = await req.json();

  if (!site_id || !email || !review_url) {
    return NextResponse.json({ error: "site_id, email, and review_url required" }, { status: 400 });
  }

  const [site] = await sql`SELECT name, subdomain, gbp_profile->>'title' AS title FROM sites WHERE id = ${site_id}`;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const businessName = (site.title as string) || (site.name as string);

  // Use TracPost redirect for click tracking + GA4 attribution
  const slug = (site.subdomain as string) || (site.name as string).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const trackedReviewUrl = `https://tracpost.com/r/${slug}?utm_source=tracpost&utm_medium=email&utm_campaign=review_request`;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: `${businessName} <reviews@tracpost.com>`,
      to: email,
      subject: `How was your experience with ${businessName}?`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="font-size: 20px; font-weight: 600; color: #111; margin: 0 0 12px 0;">
            Thank you for choosing ${businessName}
          </h2>
          <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 24px 0;">
            We hope you had a great experience. Your feedback helps us continue to improve and helps other customers find us.
          </p>
          <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 24px 0;">
            Would you take a moment to share your experience?
          </p>
          <a href="${trackedReviewUrl}" style="display: inline-block; background: #1a73e8; color: white; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 15px; font-weight: 500;">
            Leave a Review
          </a>
          <p style="font-size: 12px; color: #999; margin: 32px 0 0 0;">
            This email was sent by ${businessName}. If you received this in error, you can safely ignore it.
          </p>
        </div>
      `,
    });

    // Log the request
    await sql`
      INSERT INTO usage_log (subscription_id, action, metadata)
      SELECT subscription_id, 'review_request', ${JSON.stringify({ email, business: businessName })}::jsonb
      FROM sites WHERE id = ${site_id}
    `;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Review request email failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Email delivery failed" }, { status: 500 });
  }
}
