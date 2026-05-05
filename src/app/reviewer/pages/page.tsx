import type { Metadata } from "next";
import AppGuide from "../AppGuide";
import { logReviewerAccess } from "../access-log";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reviewer Guide — TracPost — Pages",
  robots: { index: false, follow: false, nocache: true },
};

export default async function PagesReviewerGuide() {
  await logReviewerAccess("/reviewer/pages");
  return <AppGuide app="pages" />;
}
