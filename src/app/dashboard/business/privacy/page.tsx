import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { PrivacyPanel } from "./privacy-panel";

export const dynamic = "force-dynamic";

/**
 * Subscriber privacy settings — two independent axes:
 *
 *   1. Face publishing policy (likeness)
 *      - blur (default)  / box / asis (waivered) / suppress
 *      - Applied at variant render time
 *
 *   2. Identity policy (proper names from transcripts)
 *      - anonymize (default) / allow_names (waivered)
 *      - Applied at caption generation time
 *
 * Each axis has independent waiver tracking. Subscriber can sign either,
 * both, or neither — they're orthogonal consent dimensions.
 *
 * Locked 2026-05-19.
 */
export default async function PrivacySettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) {
    return (
      <div className="p-4 space-y-6">
        <h1 className="text-lg font-semibold">Privacy</h1>
        <p className="mt-2 py-12 text-center text-muted">No business configured yet.</p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  const [row] = await sql`
    SELECT
      face_policy, face_waiver_signed_at, face_waiver_version,
      identity_policy, identity_waiver_signed_at, identity_waiver_version
    FROM sites WHERE id = ${siteId}
  `;
  if (!row) redirect("/dashboard/business");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <header>
        <h1 className="text-lg font-semibold">Privacy</h1>
        <p className="mt-1 text-sm text-muted">
          Two independent controls govern how TracPost handles people in autopilot-published content.
          Faces in images are one axis; names in captions are the other. Defaults match normal business
          publishing — crew photos, client testimonials, event recaps run as-is. Opt into stricter
          modes if your industry handles sensitive client relationships (childcare, healthcare, etc.).
        </p>
        <p className="mt-2 text-xs text-muted">
          These policies apply to <strong>autopilot output only</strong>. When you manually compose and
          publish through TracPost, your reviewed-and-accepted choice passes through unchanged.
        </p>
      </header>

      <PrivacyPanel
        siteId={siteId}
        initial={{
          face: {
            policy: row.face_policy as string,
            waiver_signed_at: row.face_waiver_signed_at as string | null,
            waiver_version: row.face_waiver_version as string | null,
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
