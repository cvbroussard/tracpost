# TracPost Pages — Reviewer UE Navigation Script

Working production document for the **TracPost Pages** Meta app re-submission.
Identifies the reviewer's expected path through each requested permission,
the confirmation surface (TracPost UI vs Facebook native), and current
build status. Used to track which flows are screencast-ready and which
need development first.

**Locked permission scope** (8 total, 1 already approved):

- `public_profile` ✓ approved (carries over)
- `email`
- `pages_show_list`
- `pages_manage_posts`
- `pages_read_engagement`
- `pages_read_user_content`
- `pages_manage_engagement`
- `business_management`

**Status legend:**

- ✅ READY — flow exists end-to-end and is recordable as-is (subject to setup)
- 🟡 NEEDS POLISH — core flow exists but has gaps that would distract reviewer
- 🔴 NOT BUILT — required UI / backend doesn't exist yet
- ⚙️ SETUP — non-code prerequisite (test account, BM Page, etc.)

---

## 1. `email` — account creation

**Use case:** OAuth-based signup; subscriber identity established via Facebook.

**Reviewer's path:**

1. Lands at TracPost signup
2. Clicks "Sign up with Facebook"
3. **Meta OAuth dialog appears** showing requested permissions (name, profile picture, email)
4. Reviewer grants → redirected to TracPost dashboard
5. Reviewer navigates to account settings → sees their email displayed

**Confirmation surface:** TracPost account settings page (own UI)

**Status:** ✅ READY

**Screencast grouping:** "Connect" (with #2 + #7)

---

## 2. `pages_show_list` — Page picker

**Use case:** Subscriber connects their Facebook Page so TracPost can publish on their behalf.

**Reviewer's path:**

1. From dashboard, clicks **Integrations** (or whatever the connect surface is named)
2. Clicks **Connect Facebook Page**
3. **Meta OAuth dialog appears** showing `pages_show_list` permission
4. Reviewer grants → returns to TracPost
5. Page picker appears with reviewer's Pages listed
6. Reviewer selects one → Page is now bound

**Confirmation surface:** TracPost Integrations showing connected Page name + thumbnail

**Status:** ✅ READY (#85 shipped)

**Screencast grouping:** "Connect" (with #1 + #7)

---

## 3. `pages_manage_posts` — publish

**Use case:** Publish posts to subscriber's Facebook Page from the Compose flow.

**Reviewer's path:**

1. With Page connected (from #2), navigates to **Compose**
2. Walks through Compose wizard (anchor → assets → caption → schedule)
3. Sees review/preview of the post
4. Clicks **Publish Now** (skip schedule for fast demo)
5. TracPost shows success state
6. Switches to Facebook in another browser window
7. Navigates to the connected Page
8. **Sees the new post live on Facebook**

**Confirmation surface:** Facebook Page (native client)

**Status:** 🟡 NEEDS POLISH

- ✓ Anchor-first restructure done (#119)
- ✗ #109 Compose Review preview component (reviewer expects to see how post will look before publish)
- ✗ #75 Default CTAs
- ✗ #115 Compose link field semantic-per-mode
- ⚠ #107 Per-asset link inference (nice-to-have, not strictly required)

**Screencast grouping:** "Publish a Post" (dedicated)

---

## 4. `pages_read_engagement` — insights

**Use case:** Subscriber sees engagement metrics for their published posts.

**Reviewer's path:**

1. With a published post (from #3), navigates to TracPost's analytics or post-detail view
2. Clicks into the published post
3. **Sees real engagement numbers** — likes, comments, reactions, reach, impressions
4. Switches to Facebook in another window
5. Goes to Page → Insights tab → finds the same post
6. Numbers match (or are close — Facebook's API has slight lag)

**Confirmation surface:** TracPost analytics view + Facebook Insights tab side-by-side

**Status:** 🔴 NOT BUILT — biggest gap on the Pages app

- ✗ #116 Engagement polling pipeline (load-bearing per attribution-chain memory)
- ✗ Per-post analytics surface in TracPost UI

**Screencast grouping:** "View Post Insights" (dedicated)

---

## 5. `pages_read_user_content` — read comments

**Use case:** Surface third-party comments on subscriber's posts so subscriber knows what's being said.

**Reviewer's path:**

1. With a published post that has at least one third-party comment (need to plant comments from a separate FB account)
2. Navigates to TracPost's comment view for the post
3. **Sees the comments list**, with each comment's author + content + timestamp
4. Switches to Facebook → opens the post → sees the same comments

**Confirmation surface:** TracPost comment view + Facebook post comments

**Status:** 🔴 NOT BUILT

- ✗ Comment list UI doesn't exist
- ✗ Comment polling pipeline (similar shape to #116, may be sub-task)

**Screencast grouping:** "Comment Management" (with #6)

---

## 6. `pages_manage_engagement` — reply / hide comments

**Use case:** Subscriber replies to comments on their posts (responds to leads) or hides spam.

**Reviewer's path A (reply):**

1. From the comment view (#5), reviewer clicks **Reply** on a comment
2. Composes a response → submits
3. Reply appears in the TracPost comment thread
4. Switches to Facebook → sees the reply nested under the original comment

**Reviewer's path B (hide):**

1. Reviewer clicks **Hide** on a spammy comment
2. Comment is marked hidden in TracPost UI
3. Switches to Facebook → comment is no longer publicly visible on the post

**Confirmation surface:** TracPost comment thread + Facebook post (comment now has reply nested OR is hidden)

**Status:** 🔴 NOT BUILT

- ✗ Reply UI
- ✗ Hide UI
- ✗ Backend: POST to Graph API for replies + comment moderation endpoints

**Screencast grouping:** "Comment Management" (with #5)

---

## 7. `business_management` — BM-managed assets

**Use case:** Subscribers whose Pages live in Meta Business Manager (often set up by an agency) can connect those Pages to TracPost.

**Reviewer's path:**

- Same flow as `pages_show_list` (#2) but with a BM-managed Page in the test scenario
- Reviewer connects, sees a Page that's inside a Business Manager appear in the picker
- Selects it → it works the same as a personally-owned Page

**Confirmation surface:** Same as #2 — Integrations showing the BM-managed Page is bound

**Status:** ✅ READY (code-wise — same flow as #2) + ⚙️ SETUP

- ⚙️ Need a BM-managed Page in the test environment for the demo
- ⚠ Screencast must explicitly call out "this Page is in Business Manager" so reviewer understands why this permission is needed

**Screencast grouping:** "Connect" (with #1 + #2)

---

## Screencast Catalog

| Screencast | Covers | Estimated length | Status |
|---|---|---|---|
| **Connect** | `email` + `pages_show_list` + `business_management` | 2-3 min | ✅ READY (pending ⚙️ BM Page setup) |
| **Publish a Post** | `pages_manage_posts` | 3-4 min | 🟡 NEEDS POLISH (#109, #75, #115) |
| **View Post Insights** | `pages_read_engagement` | 2-3 min | 🔴 NOT BUILT (#116) |
| **Comment Management** | `pages_read_user_content` + `pages_manage_engagement` | 3-4 min | 🔴 NOT BUILT (full comment UI + backend) |

## Ranked Build Sequence

To get to "all 4 screencasts recordable":

1. **Compose polish for "Publish" screencast** — #109 (FB-shaped preview), #75 (default CTAs), #115 (link field semantic). Smallest scope, builds on existing Compose. ~2-3 days.
2. **Engagement polling pipeline** — #116. Backend that polls Graph API for metrics on every published post + caches them + surfaces in TracPost UI. ~3-5 days.
3. **Comment management** — comment list view + reply UI + hide UI + Graph API integration. Largest scope. ~5-7 days.
4. **Setup work** — BM-managed test Page, OAuth-virgin test subscriber, second FB account for planting comments. ~1 day.

## Pre-submission Universal Checklist

These apply regardless of which permission's screencast is being recorded:

- [ ] Privacy policy URL is current and explicitly mentions Facebook data
- [ ] Data deletion request URL exists and is documented
- [ ] Reviewer guide page (#81) is current for Pages-specific permissions
- [ ] Reviewer role gate (#182) ships before submission so reviewer sees only Pages-scoped surfaces
- [ ] Test subscriber (`test2@tracpost.com`) is OAuth-virgin for Pages permissions before recording
- [ ] Camtasia (or chosen recorder) installed + tested

## Notes

- **Screencast best practices** (per Meta's boilerplate): English UI, captions and tool-tips, explain meaning of buttons. All handled by the recorder, not in TracPost.
- **API payloads** are NOT required in screencasts — reviewer wants subscriber-visible UX.
- **Server-to-server callout** doesn't apply to this app (all flows have visible UI).
- **Submission notes** (written) should accompany each screencast describing the use case in plain English. No JSON or curl needed.

## Cross-references

- `/docs/meta-app-review.md` — overall TracPost platform context
- Memory: `project_tracpost_attribution_chain` (why #116 is load-bearing)
- Memory: `project_tracpost_measurement_universal` (engagement polling rationale)
- Memory: `feedback_reviewer_guide_audit` (end-of-session reviewer guide audit during active review)
- Task #116 — Engagement polling pipeline
- Task #109 — Compose Review preview component
- Task #75 — Publisher default CTAs
- Task #115 — Compose link field semantic-per-mode
- Task #182 — Reviewer role gate
- Task #83 — Pre-submission test2 onboarding state check
