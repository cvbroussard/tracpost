/** Media Production › Web Pages — Phase-1 nav scaffold placeholder (temporary; replaced as functionality ports in). */
export default function MediaProductionWebPagesPage() {
  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div>
        <h1 className="text-base font-semibold">Media Production · Web Pages</h1>
        <p className="text-xs text-muted mt-1">
          Phase-1 nav scaffold. Functionality porting from existing routes is
          pending — the old routes stay live until each port lands.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-border p-4">
        <div className="text-[10px] uppercase tracking-wide text-muted mb-2">Stages</div>
        <ul className="text-[13px] space-y-1.5">
          <li><span className="font-medium">Blog articles</span></li>
          <li><span className="font-medium">Project pages</span></li>
          <li><span className="font-medium">Service-area pages</span></li>
          <li><span className="font-medium">Review</span> <span className="text-muted">— finished web-page QC</span></li>
        </ul>
        <div className="text-[10px] uppercase tracking-wide text-muted mt-3 mb-2">Ports from</div>
        <p className="text-xs text-muted">
          /ops/prompt-inspector, /ops/blog, and the &ldquo;Write Editorial
          Article&rdquo; action in /ops/site-actions.
        </p>
      </div>
    </div>
  );
}
