# Meta Review — Screencast Index

Cross-app tracker for every screencast we'll record across the three
TracPost Meta apps (Pages, Visual, Ads). Each row is a single deliverable
video. Used to track readiness, recording, submission, and approval
status in one place.

**Naming convention:** `[app]-[seq]-[slug]` — see notes at bottom.

**Status flow:**

1. 🔴 NOT BUILT — required UI / backend doesn't exist
2. 🟡 NEEDS POLISH — core flow exists but has gaps
3. ✅ READY TO RECORD — flow works end-to-end (subject to setup)
4. 🎬 RECORDED — video file exists and approved internally
5. 📤 SUBMITTED — attached to the relevant Meta app review
6. ✓ APPROVED — Meta granted the permission
7. ✗ REJECTED — Meta sent feedback, see notes

---

## TracPost Pages

| ID | Title | Permissions | Status | Recorded | Submitted | Approved |
|---|---|---|---|---|---|---|
| `pages-01-connect` | Connect | `email`, `pages_show_list`, `business_management` | ✅ READY (⚙️ BM Page setup) | — | — | — |
| `pages-02-publish` | Publish a Post | `pages_manage_posts` | 🟡 NEEDS POLISH (#109, #75, #115) | — | — | — |
| `pages-03-insights` | View Post Insights | `pages_read_engagement` | 🔴 NOT BUILT (#116) | — | — | — |
| `pages-04-comments` | Comment Management | `pages_read_user_content`, `pages_manage_engagement` | 🔴 NOT BUILT (full comment UI + backend) | — | — | — |

Detail script: [pages-script.md](./pages-script.md)

---

## TracPost Visual

_Script not yet written. Permissions locked: `public_profile`, `email`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `instagram_manage_comments`._

Likely screencasts (provisional):

| ID | Title | Permissions | Status |
|---|---|---|---|
| `visual-01-connect` | Connect IG account | `email`, `instagram_basic` | TBD |
| `visual-02-publish` | Publish a post / Reel | `instagram_content_publish` | TBD |
| `visual-03-insights` | View Post Insights | `instagram_manage_insights` | TBD |
| `visual-04-comments` | Comment Management | `instagram_manage_comments` | TBD |

Detail script: _to be created_

---

## TracPost Ads

_Script not yet written. Permissions locked: `public_profile`, `email`, `ads_management`, `ads_read`, `read_insights`, `business_management`, `pages_manage_ads`, `pages_show_list`. Marketing API Standard is a separate post-approval submission._

Likely screencasts (provisional):

| ID | Title | Permissions | Status |
|---|---|---|---|
| `ads-01-connect` | Connect Ad Account | `email`, `business_management`, `pages_show_list` | TBD |
| `ads-02-create-campaign` | Create Campaign | `ads_management` | TBD |
| `ads-03-boost-organic` | Boost an Organic Post | `pages_manage_ads`, `ads_management` | TBD |
| `ads-04-insights` | View Ad Insights | `ads_read`, `read_insights` | TBD |

Detail script: _to be created_

---

## Naming convention

`[app]-[seq]-[slug]`

- **app** — `pages`, `visual`, or `ads`
- **seq** — two-digit sequence (`01`, `02`, ...)
- **slug** — short kebab-case description

**Reasoning:**

- App prefix prevents collisions when all three apps' files sit in one recording folder
- Sequence number gives natural recording order ("now I'm working on pages-02")
- Slug makes the filename self-describing without needing the doc to decode

Use the same ID for the recording filename, the submission cross-reference, and any commits that touch related work.

---

## Universal pre-submission checklist

These apply across all three apps:

- [ ] Privacy policy URL current and Meta-aware
- [ ] Data deletion request URL exists and is documented
- [ ] Reviewer guide page (#81) updated for the specific app's permissions
- [ ] Reviewer role gate (#182) ships before submission
- [ ] Test subscriber (`test2@tracpost.com`) is OAuth-virgin for the app's permissions
- [ ] Camtasia (or chosen recorder) installed + tested
- [ ] At least one BM-managed Page in test environment (for `business_management` demo)
- [ ] Second FB account available for planting comments (for `pages-04-comments`)

## Cross-references

- `/docs/meta-app-review.md` — overall TracPost platform context for Meta
- `/docs/meta-review/pages-script.md` — Pages app reviewer UE navigation
- Memory: `project_tracpost_attribution_chain` (why #116 is load-bearing)
- Memory: `feedback_reviewer_guide_audit` (end-of-session reviewer guide audit during active review)
