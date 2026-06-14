import { redirect } from "next/navigation";

// Renamed 2026-06-12 per the three-milestone architecture: this surface is
// the "Branding" milestone's pipeline view. The "provisioning" name was a
// historical artifact from before Helper + Media Production milestones
// were separated. Redirect kept so cached bookmarks survive.
export default function Page() {
  redirect("/branding");
}
