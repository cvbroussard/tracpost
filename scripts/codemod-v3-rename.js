/**
 * v3 rename codemod (DRAFT — review the diff before committing).
 *
 * Companion to migrate-137 + docs/v3-sweep-plan.md. Handles the SAFE, high-volume
 * portion of the ~344-file sweep: SQL table/column tokens INSIDE `sql\`...\`` tagged
 * templates. Everything ambiguous (free camelCase identifiers, route dirs, the GBP
 * triad, the signed cookie) is intentionally LEFT ALONE and printed as a manual
 * checklist, because automating it would corrupt things.
 *
 * WHY SCOPED TO sql`` TEMPLATES (Pass A):
 *   - `site_id`/`subscription_id` are snake_case → essentially only appear in SQL,
 *     never as TS identifiers (those are camelCase `siteId`/`subscriptionId`).
 *   - Table words like `sites` appear in NON-SQL strings too (e.g. "/api/sites",
 *     object keys) where renaming would BREAK things. Scoping to sql`` templates
 *     means we only touch DB-layer SQL and never a URL or a fetch path.
 *   - Dynamic SQL (geo-match.ts `sql.query("...")`) is a CallExpression, not a
 *     tagged template, so it's skipped automatically — it's on the manual list.
 *
 * NOT RENAMED HERE (manual — see Pass C checklist printed at the end):
 *   - gbp_locations / gbp_location_id  (GBP triad — per-table scoping, risk #1)
 *   - camelCase identifiers: siteId, subscriptionId  (Stripe `subscriptionId`
 *     collision — TracPost's account vs Stripe's billing subscription)
 *   - route directories  (git mv api/sites→businesses, api/branches→locations,
 *     api/accounts→integrations)
 *   - Session.subscriptionId property + the signed-cookie key (needs cookie
 *     versioning + forced refresh — see sweep plan)
 *   - API request/response body `site_id` keys (front/back contract coupling)
 *
 * Usage:
 *   node scripts/codemod-v3-rename.js            # dry-run, prints per-file report
 *   node scripts/codemod-v3-rename.js --apply     # writes changes
 *
 * Prereq: npm i -D ts-morph
 */
const path = require("path");
const { Project, SyntaxKind, Node } = require("ts-morph");

const APPLY = process.argv.includes("--apply");

// Source → target. Order-independent (word boundaries), but listed specific-first
// for readability. gbp_locations is DELIBERATELY absent (manual).
const RENAMES = [
  // tables
  ["site_gbp_categories", "business_gbp_categories"],
  ["site_social_links", "business_social_links"],
  ["site_platform_assets", "business_platform_assets"],
  ["asset_branches", "asset_locations"],
  ["service_areas_canonical", "service_areas"],
  ["sites", "businesses"],
  ["branches", "locations"],
  // columns (global sweep — every site_id/subscription_id in SQL)
  ["site_id", "business_id"],
  // subscription_id → billing_account_id (NOT account_id — collides with the
  // social-platform-account meaning already on social_accounts/social_posts/etc.)
  ["subscription_id", "billing_account_id"],
];

// Belt-and-suspenders: these files are handled by hand. (Dynamic SQL is already
// skipped since it isn't a tagged template, but exclude it explicitly anyway.)
// auth.ts is the hand-managed dual-read bridge (references BOTH old subscription_id
// and new billing_account_id intentionally) — never codemod it; it's removed in 138.
const EXCLUDE_SUBSTRINGS = ["/lib/geo-match.ts", "/lib/auth.ts"];

// Build word-boundary regexes, longest source first so a specific token is tried
// before a prefix of it (defensive; \b already prevents overlap).
const PATTERNS = [...RENAMES]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([from, to]) => ({ re: new RegExp(`\\b${from}\\b`, "g"), to, from }));

function transform(content) {
  let out = content;
  let n = 0;
  for (const { re, to } of PATTERNS) {
    out = out.replace(re, () => { n++; return to; });
  }
  return { out, n };
}

// Delimiter lengths for each template-literal token kind: [prefixLen, suffixLen].
//   `...`        NoSubstitution : ` ... `        → [1,1]
//   `...${       Head           : ` ... ${       → [1,2]
//   }...${       Middle         : } ... ${       → [1,2]
//   }...`        Tail           : } ... `        → [1,1]
function delimsFor(node) {
  const k = node.getKind();
  if (k === SyntaxKind.NoSubstitutionTemplateLiteral) return [1, 1];
  if (k === SyntaxKind.TemplateHead) return [1, 2];
  if (k === SyntaxKind.TemplateMiddle) return [1, 2];
  if (k === SyntaxKind.TemplateTail) return [1, 1];
  return null;
}

function collectSqlLiteralNodes(sourceFile) {
  const out = [];
  for (const tt of sourceFile.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression)) {
    if (tt.getTag().getText() !== "sql") continue;
    const tmpl = tt.getTemplate();
    if (Node.isNoSubstitutionTemplateLiteral(tmpl)) {
      out.push(tmpl);
    } else {
      out.push(tmpl.getHead());
      for (const span of tmpl.getTemplateSpans()) out.push(span.getLiteral());
    }
  }
  return out;
}

function run() {
  const project = new Project({
    tsConfigFilePath: path.join(process.cwd(), "tsconfig.json"),
    skipAddingFilesFromTsConfig: false,
  });

  const report = []; // { file, changes }
  let totalChanges = 0;
  let filesTouched = 0;

  for (const sourceFile of project.getSourceFiles()) {
    const fp = sourceFile.getFilePath();
    if (!fp.includes("/src/")) continue;
    if (fp.endsWith(".d.ts")) continue;
    if (EXCLUDE_SUBSTRINGS.some((s) => fp.includes(s))) continue;

    // Operate on raw token text (preserves escapes); apply edits back-to-front
    // so earlier positions stay valid.
    const litNodes = collectSqlLiteralNodes(sourceFile);
    const edits = [];
    let fileChanges = 0;

    for (const node of litNodes) {
      const delims = delimsFor(node);
      if (!delims) continue;
      const [pre, suf] = delims;
      const raw = node.getText();
      const content = raw.slice(pre, raw.length - suf);
      const { out, n } = transform(content);
      if (n > 0) {
        fileChanges += n;
        edits.push({
          start: node.getStart(),
          end: node.getEnd(),
          text: raw.slice(0, pre) + out + raw.slice(raw.length - suf),
        });
      }
    }

    if (edits.length === 0) continue;

    let full = sourceFile.getFullText();
    edits.sort((a, b) => b.start - a.start);
    for (const e of edits) full = full.slice(0, e.start) + e.text + full.slice(e.end);
    sourceFile.replaceWithText(full);

    report.push({ file: path.relative(process.cwd(), fp), changes: fileChanges });
    totalChanges += fileChanges;
    filesTouched++;
  }

  // ── Report ──────────────────────────────────────────────────────
  report.sort((a, b) => b.changes - a.changes);
  console.log(`\nPass A — SQL token renames inside sql\`\` templates (${APPLY ? "APPLY" : "DRY-RUN"})`);
  console.log(`  files touched: ${filesTouched}, total token renames: ${totalChanges}\n`);
  for (const r of report.slice(0, 40)) console.log(`  ${String(r.changes).padStart(4)}  ${r.file}`);
  if (report.length > 40) console.log(`  … and ${report.length - 40} more files`);

  if (APPLY) {
    project.saveSync();
    console.log("\n✓ Written. Review the full diff before committing.");
  } else {
    console.log("\n(dry-run — no files written. Re-run with --apply to write.)");
  }

  // ── Pass C — MANUAL checklist (NOT automated) ─────────────────────
  console.log(`\nPass C — do these BY HAND (codemod can't safely):`);
  console.log(`  [ ] camelCase identifiers: siteId→businessId, subscriptionId→accountId.`);
  console.log(`        ⚠ subscriptionId collides with STRIPE's billing subscription — rename`);
  console.log(`        TracPost's only. Let the compiler guide you (rename the type member,`);
  console.log(`        fix the resulting type errors). Do NOT blanket find-replace.`);
  console.log(`  [ ] Route dirs (git mv + update internal fetch paths):`);
  console.log(`        api/sites → api/businesses, api/branches → api/locations,`);
  console.log(`        api/accounts → api/integrations  (leave api/account SINGULAR alone)`);
  console.log(`  [ ] GBP triad (risk #1): gbp_locations→gbp_profiles table refs +`);
  console.log(`        branches.gbp_location_id→gbp_profile_id, but DO NOT touch`);
  console.log(`        gbp_profiles.gbp_location_id (Google's ID). Files: blog/schema.ts,`);
  console.log(`        google/link-locations, manage/gbp.`);
  console.log(`  [ ] lib/geo-match.ts dynamic SQL (sql.query string-building, ~line 156).`);
  console.log(`  [ ] Session.subscriptionId property + signed-cookie key → bump cookie`);
  console.log(`        version + force refresh (sweep plan).`);
  console.log(`  [ ] API request/response body { site_id } keys — coordinate front+back.`);
}

run();
