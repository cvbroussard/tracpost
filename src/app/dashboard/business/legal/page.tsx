import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Legal hub — one page surfacing all three legal surfaces with
 * scope-by-beneficiary descriptions, so subscribers can navigate
 * without guessing which one to open.
 *
 * The three surfaces protect different parties:
 *   1. Terms of Service — TracPost ↔ subscriber (what each party owes)
 *   2. Privacy Policy — protects SUBSCRIBER's data (GDPR/CCPA territory)
 *   3. Content Safeguards — protects THIRD PARTIES who appear in
 *      subscriber's published content (the people in their photos,
 *      not the subscriber themselves)
 *
 * Pre-rename this conflation was the root confusion: "Privacy" was
 * being used for two different beneficiaries. The Content Safeguards
 * rename + this hub clarify the distinction in one move.
 */
export default async function LegalHubPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) {
    return (
      <div className="p-4 space-y-6">
        <h1>Legal</h1>
        <p className="mt-2 py-12 text-center text-muted">No business configured yet.</p>
      </div>
    );
  }

  const [row] = await sql`
    SELECT face_policy, face_waiver_signed_at,
           minor_face_policy, minor_face_waiver_signed_at
    FROM businesses WHERE id = ${session.activeSiteId}
  `;

  const facePolicy = (row?.face_policy as string) || "blur";
  const faceWaiverSigned = Boolean(row?.face_waiver_signed_at);
  const minorPolicy = (row?.minor_face_policy as string) || "blur";
  const minorWaiverSigned = Boolean(row?.minor_face_waiver_signed_at);

  const policyLabel = (p: string) =>
    p === "asis" ? "As-is" : p === "blur" ? "Blur" : p === "box" ? "Box" : "Suppress";

  return (
    <div className="p-4 space-y-6">
      <h1>Legal</h1>
      <p className="mt-2 mb-8 text-muted">
        Three documents govern your TracPost experience. Each protects a different party.
      </p>

      <section className="space-y-4">
        {/* Terms of Service — TracPost ↔ subscriber */}
        <Link
          href="/terms"
          className="block rounded border border-border bg-background p-4 hover:border-accent/40"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="mb-1 font-semibold">Terms of Service</h3>
              <p className="text-sm text-muted">
                The agreement between you and TracPost. Covers what each of us owes the other —
                acceptable use, billing, account termination, liability.
              </p>
              <p className="mt-2 text-xs text-dim">Public document · Last updated March 2026</p>
            </div>
            <span className="shrink-0 text-sm text-accent">Open →</span>
          </div>
        </Link>

        {/* Privacy Policy — TracPost protecting subscriber data */}
        <Link
          href="/privacy"
          className="block rounded border border-border bg-background p-4 hover:border-accent/40"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="mb-1 font-semibold">Privacy Policy</h3>
              <p className="text-sm text-muted">
                How TracPost handles <span className="font-medium text-foreground">your</span>{" "}
                data — account info, connected platforms, uploaded media, OAuth tokens.
                GDPR/CCPA territory. Read this if you want to know what we collect, why, and
                who we share it with.
              </p>
              <p className="mt-2 text-xs text-dim">Public document · Last updated March 2026</p>
            </div>
            <span className="shrink-0 text-sm text-accent">Open →</span>
          </div>
        </Link>

        {/* Content Safeguards — protecting third parties in subscriber content */}
        <Link
          href="/dashboard/business/content-safeguards"
          className="block rounded border border-border bg-background p-4 hover:border-accent/40"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="mb-1 font-semibold">Content Safeguards</h3>
              <p className="text-sm text-muted">
                How TracPost protects{" "}
                <span className="font-medium text-foreground">the people in your content</span>{" "}
                — employees, clients, family, bystanders, and minors. Face-blur defaults,
                per-face routing based on age detection, and waiver options for each.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 rounded bg-muted/5 p-3 text-xs">
                <div>
                  <div className="mb-0.5 text-dim">Adult faces</div>
                  <div className="font-medium">
                    {policyLabel(facePolicy)}
                    {facePolicy === "asis" && !faceWaiverSigned && (
                      <span className="ml-1 text-warning">(waiver unsigned)</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-0.5 text-dim">Minor faces</div>
                  <div className="font-medium">
                    {policyLabel(minorPolicy)}
                    {minorPolicy === "asis" && !minorWaiverSigned && (
                      <span className="ml-1 text-warning">(waiver unsigned)</span>
                    )}
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs text-dim">Per-business settings · You control these</p>
            </div>
            <span className="shrink-0 text-sm text-accent">Open →</span>
          </div>
        </Link>
      </section>

      <p className="mt-8 text-xs text-dim">
        Not sure which one you need?{" "}
        <span className="font-medium text-muted">Your data</span> → Privacy Policy.{" "}
        <span className="font-medium text-muted">People in your photos</span> → Content
        Safeguards. <span className="font-medium text-muted">The agreement itself</span> → Terms.
      </p>
    </div>
  );
}
