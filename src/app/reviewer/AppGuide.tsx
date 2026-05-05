import {
  PERMISSIONS,
  APP_LABELS,
  APP_METADATA,
  STAGE_LABELS,
  STAGE_DESCRIPTIONS,
  permissionsByAppAndStage,
  type ReviewerApp,
  type ReviewerPermission,
  anchorId,
  PAGE_VERSION,
  LAST_UPDATED,
  TEST_CREDENTIALS,
} from "./permissions";

interface AppGuideProps {
  app: ReviewerApp;
}

export default function AppGuide({ app }: AppGuideProps) {
  const appPermissions = PERMISSIONS.filter((p) => p.app === app);
  const gaps = appPermissions.flatMap((p) =>
    (p.gaps ?? []).map((g) => ({ permission: p, gap: g })),
  );
  const appMeta = APP_METADATA[app];
  const appId = process.env[appMeta.appIdEnvVar] ?? "(not configured)";

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 text-gray-900">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-xs font-mono text-gray-500">
          v{PAGE_VERSION} · last updated {LAST_UPDATED}
        </p>
        <h1 className="mt-1 text-3xl font-semibold">
          Meta App Reviewer Guide
        </h1>
        <p className="mt-1 text-lg text-gray-600">{APP_LABELS[app]}</p>
        <p className="mt-3 text-sm text-gray-700">
          Welcome. This page documents how to test each permission scope
          requested by this Meta app. Use the index below to jump directly
          to the scope you&apos;re reviewing.
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Meta Developer information
        </h2>
        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="font-medium text-slate-700">App name</dt>
          <dd>{appMeta.name}</dd>
          <dt className="font-medium text-slate-700">App ID</dt>
          <dd className="font-mono">{appId}</dd>
          <dt className="font-medium text-slate-700">App mode</dt>
          <dd>{appMeta.appMode}</dd>
          <dt className="font-medium text-slate-700">Owner</dt>
          <dd>{appMeta.ownerEntity}</dd>
          <dt className="font-medium text-slate-700">Contact</dt>
          <dd>
            <a
              href={`mailto:${appMeta.ownerContact}`}
              className="text-blue-700 underline"
            >
              {appMeta.ownerContact}
            </a>
          </dd>
          <dt className="font-medium text-slate-700">Privacy Policy</dt>
          <dd>
            <a
              href={appMeta.privacyPolicyUrl}
              className="text-blue-700 underline"
            >
              {appMeta.privacyPolicyUrl}
            </a>
          </dd>
          <dt className="font-medium text-slate-700">Terms of Service</dt>
          <dd>
            <a
              href={appMeta.termsOfServiceUrl}
              className="text-blue-700 underline"
            >
              {appMeta.termsOfServiceUrl}
            </a>
          </dd>
          <dt className="font-medium text-slate-700">Data Deletion</dt>
          <dd>
            <a
              href={appMeta.dataDeletionUrl}
              className="text-blue-700 underline"
            >
              {appMeta.dataDeletionUrl}
            </a>
          </dd>
        </dl>
      </section>

      <section className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-900">
          Test credentials
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 font-medium text-amber-900">
              App URL
            </dt>
            <dd>
              <a
                href={TEST_CREDENTIALS.url}
                className="text-blue-700 underline"
              >
                {TEST_CREDENTIALS.url}
              </a>
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 font-medium text-amber-900">Email</dt>
            <dd className="font-mono">{TEST_CREDENTIALS.email}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 font-medium text-amber-900">
              Password
            </dt>
            <dd className="font-mono">{TEST_CREDENTIALS.password}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 font-medium text-amber-900">
              2FA recovery codes
            </dt>
            <dd>
              <ul className="space-y-0.5 font-mono">
                {TEST_CREDENTIALS.recoveryCodes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-900/80">
                Single-use 2FA backup codes. Use one if you encounter a 2FA
                prompt during login. Each code consumes only when used.
              </p>
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 font-medium text-amber-900">Notes</dt>
            <dd className="text-amber-900">{TEST_CREDENTIALS.notes}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8" id="index">
        <h2 className="text-xl font-semibold">Permission scope index</h2>
        <p className="mt-2 text-sm text-gray-600">
          Scopes are grouped by workflow stage in the order the reviewer
          would naturally walk the app. Each row jumps to the test
          instructions for that scope.
        </p>
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Permission</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(() => {
                const groups = permissionsByAppAndStage(app);
                let rowNumber = 0;
                return groups.flatMap((group) => {
                  const stageLabel = STAGE_LABELS[group.stage];
                  const stageDesc = STAGE_DESCRIPTIONS[group.stage];
                  const stageRow = (
                    <tr
                      key={`stage-${group.stage}`}
                      className="bg-slate-100 align-top"
                    >
                      <td colSpan={4} className="px-4 py-2.5">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                          {stageLabel}
                        </div>
                        <div className="mt-0.5 text-xs font-normal normal-case text-slate-600">
                          {stageDesc}
                        </div>
                      </td>
                    </tr>
                  );
                  const permRows = group.permissions.map((p) => {
                    rowNumber += 1;
                    return (
                      <tr key={anchorId(p)} className="bg-white align-top">
                        <td className="px-4 py-3 text-gray-500">
                          {rowNumber}
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={`#${anchorId(p)}`}
                            className="font-mono text-blue-700 underline"
                          >
                            {p.scope}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {p.description}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={p.status} />
                        </td>
                      </tr>
                    );
                  });
                  return [stageRow, ...permRows];
                });
              })()}
            </tbody>
          </table>
        </div>
      </section>

      {gaps.length > 0 && (
        <section className="mt-8 rounded-lg border border-rose-200 bg-rose-50 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-rose-900">
            Internal gap summary ({gaps.length} open)
          </h2>
          <p className="mt-2 text-xs text-rose-900/80">
            This block is for the TracPost team — items here must be
            resolved before submitting this app for Meta App Review. Will
            be removed before public reviewer access.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-rose-900">
            {gaps.map((g, i) => (
              <li key={i}>
                <span className="font-mono text-xs">{g.permission.scope}</span>
                {": "}
                {g.gap}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-12 space-y-12">
        {appPermissions.map((p) => (
          <PermissionSection key={anchorId(p)} permission={p} />
        ))}
      </div>

      <footer className="mt-16 border-t border-gray-200 pt-6 text-sm text-gray-600">
        <p>
          Questions? Email{" "}
          <a
            href="mailto:reviewer-support@tracpost.com"
            className="text-blue-700 underline"
          >
            reviewer-support@tracpost.com
          </a>{" "}
          and a TracPost engineer will respond within one business day.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Screencast video for this submission is provided directly in the
          App Review submission form per Meta&apos;s requirement.
        </p>
      </footer>
    </main>
  );
}

function StatusPill({ status }: { status: ReviewerPermission["status"] }) {
  const styles: Record<ReviewerPermission["status"], string> = {
    ready: "bg-emerald-50 text-emerald-700 border-emerald-200",
    partial: "bg-amber-50 text-amber-800 border-amber-200",
    gap: "bg-rose-50 text-rose-700 border-rose-200",
  };
  const labels: Record<ReviewerPermission["status"], string> = {
    ready: "Ready",
    partial: "Partial",
    gap: "Gap",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function PermissionSection({
  permission,
}: {
  permission: ReviewerPermission;
}) {
  return (
    <section
      id={anchorId(permission)}
      className="scroll-mt-6 border-t border-gray-200 pt-8"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {STAGE_LABELS[permission.workflowStage]}
          </p>
          <h2 className="mt-0.5 font-mono text-2xl font-semibold">
            {permission.scope}
          </h2>
          {permission.verifiedAt && (
            <p className="mt-1 text-xs text-gray-500">
              verified {permission.verifiedAt}
            </p>
          )}
        </div>
        <StatusPill status={permission.status} />
      </div>

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Why we need this scope
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-800">
        {permission.whyWeNeed}
      </p>

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-gray-500">
        How to test
      </h3>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-gray-800">
        {permission.testSteps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Expected outcome
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-800">
        {permission.expectedOutcome}
      </p>

      {permission.demoLink && (
        <p className="mt-4 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Direct demo link:
          </span>{" "}
          <a
            href={`${permission.demoLink}?fromReview=1`}
            className="text-blue-700 underline"
          >
            {permission.demoLink}
          </a>
        </p>
      )}

      {permission.gaps && permission.gaps.length > 0 && (
        <div className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-900">
            Internal — open gaps for this scope
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-900">
            {permission.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-sm">
        <a href="#index" className="text-blue-700 underline">
          ↑ Back to index
        </a>
      </p>
    </section>
  );
}
