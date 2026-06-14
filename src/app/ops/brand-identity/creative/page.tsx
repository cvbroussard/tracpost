import { redirect } from "next/navigation";

// Retired 2026-06-11 per the bucket→domain restructure. Owner-curated
// descriptors that previously lived under /creative are now navigated by
// their domain (strategic / verbal / visual / sonic). Strategic is the
// natural landing for the legacy /creative URL.
export default function Page() {
  redirect("/brand-identity/strategic");
}
