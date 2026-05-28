import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { PrivacyPanel } from "./privacy-panel";

export const dynamic = "force-dynamic";

/**
 * Content Safeguards — three independent axes protecting the people who
 * appear in subscriber-published content:
 *
 *   1. Adult face policy
 *      - blur (default) / box / asis (waivered) / suppress
 *      - Applied per-face at variant render time
 *
 *   2. Minor face policy  (per-face routing via AWS AgeRange.Low<18)
 *      - blur (default) / box / asis (waivered) / suppress
 *      - Stronger waiver: affirms parental / legal-guardian consent
 *
 *   3. Identity policy (proper names from transcripts)
 *      - anonymize (default) / allow_names (waivered)
 *      - Applied at caption generation time
 *
 * Each axis carries its own waiver record — subscriber can sign any
 * subset. Defaults are conservative everywhere; permissive options
 * require explicit waiver acknowledgment.
 */
export default async function ContentSafeguardsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) {
    return (
      <div className="p-4 space-y-6">
        <h1 className="text-lg font-semibold">Content Safeguards</h1>
        <p className="mt-2 py-12 text-center text-muted">No business configured yet.</p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  const [row] = await sql`
    SELECT
      face_policy, face_waiver_signed_at, face_waiver_version,
      minor_face_policy, minor_face_waiver_signed_at, minor_face_waiver_version,
      identity_policy, identity_waiver_signed_at, identity_waiver_version
    FROM businesses WHERE id = ${siteId}
  `;
  if (!row) redirect("/dashboard/business");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <header>
        <h1 className="text-lg font-semibold">Content Safeguards</h1>
        <p className="mt-1 text-sm text-muted">
          These controls govern how TracPost handles the <strong>people who appear</strong> in
          your published content — employees, clients, family members, bystanders, and minors.
          They are separate from TracPost&apos;s{" "}
          <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>, which
          covers how we handle <em>your</em> data.
        </p>
        <p className="mt-2 text-sm text-muted">
          Defaults are conservative (blur faces, anonymize names) so the system is safe out of
          the box — no waivers required. Opt into permissive modes if your business benefits
          from publishing faces or named people (crew attribution, client testimonials, event
          recaps) and you have the necessary consent.
        </p>
        <p className="mt-2 text-xs text-muted">
          These policies apply to <strong>autopilot output only</strong>. When you manually
          compose and publish through TracPost, your reviewed-and-accepted choice passes
          through unchanged.
        </p>
      </header>

      {/* Prominent minor-protection coaching block — TracPost's posture
          on minors is its own banner, not buried in the third axis card.
          Sets context for the dedicated minor face waiver below. */}
      <section className="rounded-lg border border-accent/30 bg-accent/5 p-4">
        <h2 className="mb-2 text-sm font-semibold">TracPost&apos;s commitment to minors</h2>
        <div className="space-y-2 text-xs text-muted">
          <p>
            Photos of children, teens, and minors are common in our subscribers&apos; work —
            family in event coverage, kids in crew shots, students at job sites. We respect
            that legitimate businesses publish minor faces every day with proper parental
            consent.
          </p>
          <p>
            <strong className="text-foreground">
              At the same time, parental consent is a higher bar than adult consent
            </strong>
            , and TracPost treats it that way. AWS Rekognition flags faces that may be under
            18 (estimated, not perfect). Those faces are routed through the{" "}
            <em>minor face policy</em> below — a separate axis from the adult face policy, with
            its own stronger waiver affirming parental or legal-guardian authorization.
          </p>
          <p>
            By default, minor faces are blurred regardless of your adult face policy. To
            publish them unaltered, you sign a waiver attesting that you have verifiable
            parental / legal-guardian consent for each minor whose face appears in your
            content. The waiver is non-trivial by design — it&apos;s the part where TracPost
            asks you to be sure.
          </p>
        </div>
      </section>

      <PrivacyPanel
        siteId={siteId}
        initial={{
          face: {
            policy: row.face_policy as string,
            waiver_signed_at: row.face_waiver_signed_at as string | null,
            waiver_version: row.face_waiver_version as string | null,
          },
          minor_face: {
            policy: (row.minor_face_policy as string) || "blur",
            waiver_signed_at: row.minor_face_waiver_signed_at as string | null,
            waiver_version: row.minor_face_waiver_version as string | null,
          },
          identity: {
            policy: row.identity_policy as string,
            waiver_signed_at: row.identity_waiver_signed_at as string | null,
            waiver_version: row.identity_waiver_version as string | null,
          },
        }}
      />
    </div>
  );
}
