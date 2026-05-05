import type { Metadata } from "next";
import Link from "next/link";
import {
  PERMISSIONS,
  APP_LABELS,
  PAGE_VERSION,
  LAST_UPDATED,
  type ReviewerApp,
} from "./permissions";
import { logReviewerAccess } from "./access-log";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reviewer Guide — Internal",
  robots: { index: false, follow: false, nocache: true },
};

const APPS: ReviewerApp[] = ["pages", "visual", "ads"];

export default async function ReviewerIndex() {
  await logReviewerAccess("/reviewer");

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-gray-900">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-xs font-mono text-gray-500">
          v{PAGE_VERSION} · last updated {LAST_UPDATED}
        </p>
        <h1 className="mt-1 text-3xl font-semibold">
          Meta Reviewer Guide — Internal Index
        </h1>
        <p className="mt-3 text-sm text-gray-700">
          This page is for internal navigation. Each Meta App Review submission
          links to its own per-app reviewer guide below. Reviewers come in
          per-app — they should never see this index.
        </p>
      </header>

      <section className="mt-8 space-y-4">
        {APPS.map((app) => {
          const count = PERMISSIONS.filter((p) => p.app === app).length;
          const gapCount = PERMISSIONS.filter((p) => p.app === app).reduce(
            (sum, p) => sum + (p.gaps?.length ?? 0),
            0,
          );
          return (
            <Link
              key={app}
              href={`/reviewer/${app}`}
              className="block rounded-lg border border-gray-200 p-5 hover:border-gray-400 hover:bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{APP_LABELS[app]}</h2>
                <span className="font-mono text-xs text-gray-500">
                  /reviewer/{app}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                {count} permission scope{count === 1 ? "" : "s"} ·{" "}
                {gapCount === 0 ? (
                  <span className="text-emerald-700">no open gaps</span>
                ) : (
                  <span className="text-rose-700">
                    {gapCount} open gap{gapCount === 1 ? "" : "s"}
                  </span>
                )}
              </p>
            </Link>
          );
        })}
      </section>

      <section className="mt-12 border-t border-gray-200 pt-6 text-sm text-gray-600">
        <h2 className="font-semibold text-gray-900">Maintenance reminders</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>
            Per the end-of-session reviewer audit discipline, every session
            touching reviewer-walked UE must end with a re-walk against{" "}
            <code className="font-mono">permissions.ts</code> and additive
            page updates if drift is detected.
          </li>
          <li>
            Bump <code className="font-mono">PAGE_VERSION</code> and{" "}
            <code className="font-mono">LAST_UPDATED</code> on every edit.
          </li>
          <li>
            Updates during an active review must be additive only — never
            change behavior-describing text in a way that contradicts what a
            reviewer might already have seen.
          </li>
          <li>
            Access logs (grep <code className="font-mono">REVIEWER_ACCESS</code>{" "}
            in Vercel logs) show whether reviewers are opening pages.
          </li>
          <li>
            Rotate <code className="font-mono">TEST_CREDENTIALS</code> after
            each review window closes.
          </li>
        </ul>
      </section>
    </main>
  );
}
