/** Media Production › Standard Posts — Phase-1 nav scaffold placeholder (temporary; replaced as functionality ports in). */
export default function MediaProductionStandardPostsPage() {
  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div>
        <h1 className="text-base font-semibold">Media Production · Standard Posts</h1>
        <p className="text-xs text-muted mt-1">
          Phase-1 nav scaffold. Sparse by design — crop + caption is bulletproof
          background work, so this branch has little to forge.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-border p-4">
        <div className="text-[10px] uppercase tracking-wide text-muted mb-2">Stages</div>
        <ul className="text-[13px] space-y-1.5">
          <li><span className="font-medium">Carousels</span> <span className="text-muted">— sub-format</span></li>
          <li><span className="font-medium">GBP posts</span> <span className="text-muted">— structured sub-type</span></li>
          <li><span className="font-medium">Review</span> <span className="text-muted">— light QC</span></li>
        </ul>
      </div>
    </div>
  );
}
