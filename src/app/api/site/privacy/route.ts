import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Site-level privacy policy state (face + minor face + identity).
 *
 * Three independent axes:
 *   face_policy        adult faces at variant render time
 *                      (blur / box / asis / suppress)
 *   minor_face_policy  faces flagged as potential minors (AgeRange.Low<18)
 *                      at variant render time — separate axis because
 *                      parental consent is a different ask than adult
 *                      consent. Subscribers commonly have employee/client
 *                      consent without parental authorization. Routed
 *                      per-face by face-detect.ts is_potential_minor.
 *   identity_policy    caption-gen name preservation
 *                      (allow_names / anonymize)
 *
 * Each axis has independent waiver tracking. The minor face waiver is
 * meaningfully stronger than the adult face waiver (parental / legal-
 * guardian consent affirmation, not generic publisher-of-record).
 *
 * Picking a permissive option (`asis` for faces or minor faces,
 * `allow_names` for identity) requires the matching waiver. Reverting
 * to a conservative option doesn't auto-revoke the waiver record — it
 * stays for audit but no longer gates behavior.
 *
 * Authorization: subscriber must own the site_id (via session.sites).
 */

const FACE_POLICIES = ["asis", "box", "blur", "suppress"] as const;
const IDENTITY_POLICIES = ["allow_names", "anonymize"] as const;
const FACE_WAIVER_VERSION = "v1-2026-05-19";
const MINOR_FACE_WAIVER_VERSION = "v1-2026-05-19";
const IDENTITY_WAIVER_VERSION = "v1-2026-05-19";

type FacePolicy = (typeof FACE_POLICIES)[number];
type IdentityPolicy = (typeof IDENTITY_POLICIES)[number];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }
  if (!session.sites.some((s) => s.id === siteId)) {
    return NextResponse.json({ error: "Site not in your subscription" }, { status: 403 });
  }

  const [row] = await sql`
    SELECT face_policy, face_waiver_signed_at, face_waiver_version,
           minor_face_policy, minor_face_waiver_signed_at, minor_face_waiver_version,
           identity_policy, identity_waiver_signed_at, identity_waiver_version
    FROM businesses WHERE id = ${siteId}
  `;
  if (!row) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  return NextResponse.json({
    face: {
      policy: row.face_policy,
      waiver_signed_at: row.face_waiver_signed_at,
      waiver_version: row.face_waiver_version,
      current_waiver_version: FACE_WAIVER_VERSION,
    },
    minor_face: {
      policy: row.minor_face_policy,
      waiver_signed_at: row.minor_face_waiver_signed_at,
      waiver_version: row.minor_face_waiver_version,
      current_waiver_version: MINOR_FACE_WAIVER_VERSION,
    },
    identity: {
      policy: row.identity_policy,
      waiver_signed_at: row.identity_waiver_signed_at,
      waiver_version: row.identity_waiver_version,
      current_waiver_version: IDENTITY_WAIVER_VERSION,
    },
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    site_id?: string;
    face_policy?: string;
    minor_face_policy?: string;
    identity_policy?: string;
    sign_face_waiver?: boolean;
    sign_minor_face_waiver?: boolean;
    sign_identity_waiver?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    site_id,
    face_policy,
    minor_face_policy,
    identity_policy,
    sign_face_waiver,
    sign_minor_face_waiver,
    sign_identity_waiver,
  } = body;
  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }
  if (!session.sites.some((s) => s.id === site_id)) {
    return NextResponse.json({ error: "Site not in your subscription" }, { status: 403 });
  }

  if (face_policy && !FACE_POLICIES.includes(face_policy as FacePolicy)) {
    return NextResponse.json(
      { error: `face_policy must be one of: ${FACE_POLICIES.join(", ")}` },
      { status: 400 },
    );
  }
  if (minor_face_policy && !FACE_POLICIES.includes(minor_face_policy as FacePolicy)) {
    return NextResponse.json(
      { error: `minor_face_policy must be one of: ${FACE_POLICIES.join(", ")}` },
      { status: 400 },
    );
  }
  if (identity_policy && !IDENTITY_POLICIES.includes(identity_policy as IdentityPolicy)) {
    return NextResponse.json(
      { error: `identity_policy must be one of: ${IDENTITY_POLICIES.join(", ")}` },
      { status: 400 },
    );
  }

  // Waiver gate: picking 'asis' for any face axis requires the matching
  // sign_*_waiver=true in the same call OR a prior signed waiver.
  const [current] = await sql`
    SELECT face_waiver_signed_at, minor_face_waiver_signed_at, identity_waiver_signed_at
    FROM businesses WHERE id = ${site_id}
  `;
  if (!current) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  if (face_policy === "asis" && !current.face_waiver_signed_at && !sign_face_waiver) {
    return NextResponse.json(
      { error: "face_policy='asis' requires sign_face_waiver=true" },
      { status: 400 },
    );
  }
  if (
    minor_face_policy === "asis" &&
    !current.minor_face_waiver_signed_at &&
    !sign_minor_face_waiver
  ) {
    return NextResponse.json(
      { error: "minor_face_policy='asis' requires sign_minor_face_waiver=true" },
      { status: 400 },
    );
  }
  if (identity_policy === "allow_names" && !current.identity_waiver_signed_at && !sign_identity_waiver) {
    return NextResponse.json(
      { error: "identity_policy='allow_names' requires sign_identity_waiver=true" },
      { status: 400 },
    );
  }

  const willSignFaceWaiver = sign_face_waiver === true && !current.face_waiver_signed_at;
  const willSignMinorFaceWaiver =
    sign_minor_face_waiver === true && !current.minor_face_waiver_signed_at;
  const willSignIdentityWaiver =
    sign_identity_waiver === true && !current.identity_waiver_signed_at;

  await sql`
    UPDATE businesses SET
      face_policy = COALESCE(${face_policy ?? null}, face_policy),
      face_waiver_signed_at = CASE WHEN ${willSignFaceWaiver}
        THEN NOW() ELSE face_waiver_signed_at END,
      face_waiver_version = CASE WHEN ${willSignFaceWaiver}
        THEN ${FACE_WAIVER_VERSION} ELSE face_waiver_version END,
      minor_face_policy = COALESCE(${minor_face_policy ?? null}, minor_face_policy),
      minor_face_waiver_signed_at = CASE WHEN ${willSignMinorFaceWaiver}
        THEN NOW() ELSE minor_face_waiver_signed_at END,
      minor_face_waiver_version = CASE WHEN ${willSignMinorFaceWaiver}
        THEN ${MINOR_FACE_WAIVER_VERSION} ELSE minor_face_waiver_version END,
      identity_policy = COALESCE(${identity_policy ?? null}, identity_policy),
      identity_waiver_signed_at = CASE WHEN ${willSignIdentityWaiver}
        THEN NOW() ELSE identity_waiver_signed_at END,
      identity_waiver_version = CASE WHEN ${willSignIdentityWaiver}
        THEN ${IDENTITY_WAIVER_VERSION} ELSE identity_waiver_version END,
      updated_at = NOW()
    WHERE id = ${site_id}
  `;

  return NextResponse.json({ ok: true });
}
