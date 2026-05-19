/**
 * Migration 131: Flip privacy defaults to match industry norms.
 *
 * Migration 130 shipped with conservative defaults (blur faces +
 * anonymize names) under the assumption that subscribers should land
 * on the safest posture. Discussion 2026-05-19 reframed this:
 *
 *   - Most subscribers publish crew photos, client testimonials, event
 *     recaps, recognition pieces. Industry norms allow faces + names
 *     freely. Conservative defaults are a friction tax on normal use.
 *
 *   - Stricter modes (blur/box/suppress + anonymize) exist for
 *     sensitive industries: childcare, healthcare, addiction recovery,
 *     before/after cosmetic, litigation-prone fields. These subscribers
 *     opt INTO the stricter posture; they're the minority.
 *
 *   - Waiver still attaches to the permissive default because TracPost
 *     is the autopilot publisher-of-record. Subscriber acknowledges
 *     publisher liability is on them.
 *
 * Also locked in this discussion (no migration impact, design note for
 * downstream pieces 2-6):
 *   - Privacy enforcement applies to AUTOPILOT output only. Manual
 *     compose passes through unchanged — subscriber sees what they're
 *     publishing and accepts it.
 *   - Per-asset override dropped from v1 roadmap. Global setting only.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("131: Flipping privacy defaults to match industry norms...");

  // Update column defaults for NEW rows going forward
  await sql`ALTER TABLE sites ALTER COLUMN face_policy SET DEFAULT 'asis'`;
  console.log("  + sites.face_policy default → 'asis'");

  await sql`ALTER TABLE sites ALTER COLUMN identity_policy SET DEFAULT 'allow_names'`;
  console.log("  + sites.identity_policy default → 'allow_names'");

  // Migrate existing rows that still have the prior defaults
  // (untouched by any subscriber since migration 130 shipped today).
  // Anyone who's actively chosen 'blur'/'anonymize' would have a
  // recent updated_at; for the dev/test sites here they're all on the
  // initial default and never touched, so this is a clean reset.
  const faceUpdates = await sql`
    UPDATE sites SET face_policy = 'asis'
    WHERE face_policy = 'blur'
      AND face_waiver_signed_at IS NULL
    RETURNING id, name
  `;
  console.log(`  + ${faceUpdates.length} sites updated to face_policy='asis'`);

  const idUpdates = await sql`
    UPDATE sites SET identity_policy = 'allow_names'
    WHERE identity_policy = 'anonymize'
      AND identity_waiver_signed_at IS NULL
    RETURNING id, name
  `;
  console.log(`  + ${idUpdates.length} sites updated to identity_policy='allow_names'`);

  // Verify
  const facePolicies = await sql`
    SELECT face_policy, COUNT(*)::int AS n FROM sites GROUP BY face_policy
  `;
  console.log("\n  sites.face_policy distribution:");
  for (const r of facePolicies) console.log(`    ${r.face_policy}: ${r.n}`);

  const idPolicies = await sql`
    SELECT identity_policy, COUNT(*)::int AS n FROM sites GROUP BY identity_policy
  `;
  console.log("\n  sites.identity_policy distribution:");
  for (const r of idPolicies) console.log(`    ${r.identity_policy}: ${r.n}`);

  console.log("\n  NOTE: existing sites have face_waiver_signed_at = NULL");
  console.log("  even though policy='asis'. This is intentional — settings page");
  console.log("  will surface the unsigned-waiver state. Downstream enforcement");
  console.log("  (piece 4) treats unsigned-waiver-on-permissive-policy as");
  console.log("  fall-back-to-conservative until subscriber signs.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
