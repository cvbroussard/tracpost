import { redirect } from "next/navigation";

// Retired 2026-06-11 per the bucket→domain restructure. The Statistical
// bucket descriptors (engine-generated) now render as read-only inside
// their respective domain pages — most of them on /strategic, plus
// `tagline` on /verbal. Strategic is the natural landing.
export default function Page() {
  redirect("/ops/brand-identity/strategic");
}
