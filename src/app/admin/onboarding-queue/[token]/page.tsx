import { sql } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompleteButton } from "./complete-button";
import { NudgePanel } from "./nudge-panel";

export const dynamic = "force-dynamic";

const ALL_PLATFORMS = [
  "instagram",
  "facebook",
  "gbp",
  "linkedin",
  "youtube",
  "pinterest",
  "tiktok",
  "twitter",
];

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  gbp: "Google Business",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  pinterest: "Pinterest",
  tiktok: "TikTok",
  twitter: "X (Twitter)",
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function OnboardingQueueDetail({ params }: Props) {
  const { token } = await params;

  const [submission] = await sql`
    SELECT
      os.*,
      u.name AS owner_name,
      u.email AS owner_email,
      u.phone AS owner_phone,
      sub.plan,
      sub.created_at AS subscription_created_at,
      sub.metadata AS subscription_metadata
    FROM onboarding_submissions os
    LEFT JOIN subscriptions sub ON sub.id = os.subscription_id
    LEFT JOIN users u ON u.subscription_id = os.subscription_id AND u.role = 'owner'
    WHERE os.token = ${token}
    LIMIT 1
  `;

  if (!submission) notFound();

  const data = (submission.data || {}) as Record<string, unknown>;
  const platformStatus = (submission.platform_status || {}) as Record<string, string>;
  const subMeta = (submission.subscription_metadata || {}) as Record<string, unknown>;
  const stripe = (subMeta.stripe || {}) as Record<string, string>;

  const connectedCount = ALL_PLATFORMS.filter((p) => platformStatus[p] === "connected").length;

  // Suggest a default platform for the nudge based on most-recent failed/missing platform
  const defaultStuckPlatform = ALL_PLATFORMS.find((p) => platformStatus[p] === "failed")
    || ALL_PLATFORMS.find((p) => !platformStatus[p] || platformStatus[p] === "pending");

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <Link
          href="/admin/onboarding-queue"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Back to queue
        </Link>
      </div>

      <header className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {(data.business_name as string) || "(unnamed business)"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {submission.owner_name as string} · {submission.owner_email as string}
            {submission.owner_phone ? ` · ${submission.owner_phone}` : ""}
          </p>
          <p className="mt-1 text-xs text-dim">
            Plan: <span className="capitalize">{submission.plan as string}</span> ·{" "}
            {submission.submitted_at
              ? `Submitted ${new Date(submission.submitted_at as string).toLocaleString()}`
              : `In progress (step ${submission.current_step}/7)`}
            {submission.completed_at
              ? ` · Completed ${new Date(submission.completed_at as string).toLocaleString()}`
              : ""}
          </p>
        </div>

        {submission.submitted_at && !submission.completed_at && (
          <CompleteButton token={token} />
        )}
        {submission.completed_at && (
          <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700">
            ✓ Completed
          </span>
        )}
      </header>

      {!submission.completed_at && (
        <NudgePanel token={token} defaultPlatform={defaultStuckPlatform} />
      )}

      <Section title="Business basics">
        <KV label="Business name" value={data.business_name as string} />
        <KV label="Industry / type" value={data.business_type as string} />
        <KV label="Location" value={data.location as string} />
        <KV label="Website" value={data.website as string} link />
        <KV label="Years in business" value={data.years_in_business as string} />
      </Section>

      <Section title="Voice & differentiation">
        <KV label="What makes you different" value={data.differentiator as string} multiline />
        <KV label="Tone preferences" value={data.tone_notes as string} multiline />
      </Section>

      <Section title="Brand">
        <KV label="Primary color" value={data.brand_color as string} swatch={data.brand_color as string} />
        <KV label="Logo uploaded" value={data.logo_url ? "Yes" : "No"} link={data.logo_url as string} />
      </Section>

      <Section title="Platform connections">
        <div className="space-y-2">
          {ALL_PLATFORMS.map((p) => {
            const status = platformStatus[p] || "pending";
            return (
              <div
                key={p}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2.5"
              >
                <span className="text-sm font-medium text-foreground">{PLATFORM_LABEL[p]}</span>
                <PlatformStatusBadge status={status} />
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">
          {connectedCount} of {ALL_PLATFORMS.length} connected.
        </p>
      </Section>

      <Section title="Owner contact">
        <KV label="Name" value={submission.owner_name as string} />
        <KV label="Email" value={submission.owner_email as string} />
        <KV label="Phone" value={(submission.owner_phone as string) || (data.owner_phone as string)} />
        <KV label="Preferred contact" value={data.preferred_contact as string} />
      </Section>

      {(stripe.customer_id || stripe.subscription_id) && (
        <Section title="Stripe references">
          <KV label="Customer ID" value={stripe.customer_id} mono />
          <KV label="Subscription ID" value={stripe.subscription_id} mono />
        </Section>
      )}

      <Section title="Raw submission JSON" defaultClosed>
        <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-4 text-xs text-foreground">
          {JSON.stringify(data, null, 2)}
        </pre>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  defaultClosed,
}: {
  title: string;
  children: React.ReactNode;
  defaultClosed?: boolean;
}) {
  return (
    <details open={!defaultClosed} className="mb-6 rounded-xl border border-border bg-surface">
      <summary className="cursor-pointer px-5 py-3 text-sm font-semibold uppercase tracking-wide text-muted hover:bg-surface-hover">
        {title}
      </summary>
      <div className="px-5 pb-5 pt-2">{children}</div>
    </details>
  );
}

function KV({
  label,
  value,
  link,
  multiline,
  mono,
  swatch,
}: {
  label: string;
  value?: string | null;
  link?: boolean | string;
  multiline?: boolean;
  mono?: boolean;
  swatch?: string;
}) {
  if (!value) {
    return (
      <div className="grid grid-cols-[180px_1fr] gap-4 py-1.5">
        <span className="text-xs text-muted">{label}</span>
        <span className="text-sm text-dim italic">—</span>
      </div>
    );
  }

  const linkHref = typeof link === "string" ? link : value;
  const isLink = !!link && linkHref?.startsWith("http");

  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 py-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span
        className={`text-sm text-foreground ${multiline ? "whitespace-pre-wrap" : ""} ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {swatch && (
          <span
            className="mr-2 inline-block h-3 w-3 rounded border border-black/10 align-middle"
            style={{ background: swatch }}
          />
        )}
        {isLink ? (
          <a
            href={linkHref}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline hover:no-underline"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </span>
    </div>
  );
}

function PlatformStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    connected: "bg-green-100 text-green-700 border-green-200",
    creating: "bg-blue-100 text-blue-700 border-blue-200",
    skipped: "bg-amber-100 text-amber-700 border-amber-200",
    failed: "bg-red-100 text-red-700 border-red-200",
    pending: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status] || styles.pending}`}
    >
      {status}
    </span>
  );
}
