# Agthia Enhancements — Plan

> Living plan and cross-chat memory. Read this first in any new chat.
> Rule: nothing gets built or changed without the owner's final OK.
> App name: **Agthia Enhancements** (was "Docket" while designing). Name used as plain text only; no Agthia logo or brand colours unless the owner provides them.

---

## What it is

A tracker that turns emails into work you can follow.

- A **Member** adds an email (paste or upload).
- The system reads it and turns it into a **Case** with one or more **Points**.
- The Member posts **Updates** as the work moves.
- The **Lead** sees everything, adds **Remarks**, approves or reopens, and gets reports.

---

## Roles

| Role | Can see | Can do |
|---|---|---|
| **Lead** (one account) | Every Case, every Member | Add Members, set deadlines, remark, approve / reopen Points, view analytics |
| **Member** | Only their own Cases | Add emails, edit what the system extracted, post updates, set deadlines, mark Points done |

- Start: **1 Lead + 1 Member**. The Lead adds more Members from the Team page.
- Role names are final: **Lead** and **Member**.

---

## Core things in the system

| Thing | What it is | Key fields |
|---|---|---|
| **Case** | One email | Title, summary, sender / client, priority, deadline, original email, source (paste / file), Member, progress |
| **Point** | One action inside a Case | Title, details, status, deadline |
| **Update** | Member's progress note on a Point | Text, time, status change |
| **Remark** | Lead's note on a Point or Case | Text, time |
| **Alert** | Notification | Type, link, read / unread |

---

## Adding an email

- Three ways in: **paste text**, **drag and drop**, **upload** (`.eml`, `.msg`, `.txt`).
- No direct Outlook connection (ruled out by the owner).
- The system extracts: summary, sender / client, priority, deadline, Points, and anything else useful in the mail.
- The Member reviews and **edits everything** before saving.

---

## Point flow (default; to be finalized)

`To Do → In Progress → Waiting → Done → Lead approves (or reopens)`

- **Waiting** = blocked on someone else; the reason is shown.
- A Case shows progress (e.g. 3 / 5) and closes when every Point is approved.
- **Open:** owner will share the types of emails they get; flow gets adjusted after that.

---

## Deadlines and alerts

- Lead and Member can both set deadlines (on a Case or a Point).
- **In-app bell:** new remark, deadline near, overdue, Point reopened, Point marked done (to Lead).
- **Email:** reminder before a deadline, overdue notice.

---

## Dashboards

**Member**
- My open Points, due this week, overdue
- Latest remarks from the Lead
- My on-time rate

**Lead**
- Team overview: open / overdue / closed
- Workload per Member
- On-time rate, average time to close
- New Cases per week
- Upcoming deadlines
- A page per Member

---

## Look and feel rules

- No "AI look": no purple gradients, no emoji, no default fonts (Inter / Roboto / Arial / Space Grotesk).
- No "bubble" look: no outlined pills or chips everywhere; status is an icon + a word.
- Calm, not a rat race: soft wording, no red alarm boxes; red appears only as a small dot.
- Glass panels over an office background. Light mode only for now (dark mode later, if wanted).
- Neat, clean and smooth: every movement eases (tabs, panels, menus, tour).
- Fast to use: drag-drop upload, board / list toggle, keyboard shortcuts, Ctrl+K search, a floating tour for new users.

---

## Stack

- **App:** Next.js (TypeScript) on Vercel
- **Data:** Neon Postgres
- **Email reading:** Claude API (Claude Opus, structured JSON output; server-side model fallback switched on)
- **Email alerts:** Resend
- **Login:** email + password; people join through invite links from the Lead

---

## Where things live

| Thing | Where | Notes |
|---|---|---|
| Code | GitHub `Saxqb777/outlook-enhancment-tracker-`, branch `claude/nice-babbage-j31aej` (also the repo's default branch) | Every push to this branch deploys to production |
| Hosting | Vercel project `agthia-enhancements` (team "saxqb777's projects") | Functions in `fra1` (Frankfurt), Node 22. Vercel login wall only on preview links |
| Database | Neon project `agthia-enhancements` (`delicate-flower-67324386`), region AWS Frankfurt, Postgres 17, database `agthia` | Free plan. Schema in `db/migrations/` |
| Attachments | Vercel Blob store `agthia-attachments` (`store_KHKAbOECu9DjS5bD`), **private**, region Dubai (dxb1). Env `BLOB_READ_WRITE_TOKEN` added by Vercel | Browser uploads straight to storage with a 10-minute permission from `/api/attachments` (checks the person can edit that point). Files are only served through `/attachments/<id>` to people who can see the case. Without the token (local testing) files go to the `attachment_local` table instead. `POST /api/attachments/selftest` with header `x-setup-code` checks storage end to end |
| Original email files | Neon table `email_files` (up to 2.5 MB each), served only to people who can see the case at `/files/<email id>` | Neon free plan has about 0.5 GB, roughly a few hundred PDFs. Move to Vercel Blob or a paid Neon plan if it fills up |
| Secrets | Vercel environment variables `DATABASE_URL`, `SETUP_CODE`, `ANTHROPIC_API_KEY` (all sensitive) | Never commit these. `.env.example` lists the names. The Claude key was given by the owner on 2026-11-06 |
| Demo | Always at `/demo` (the `SANDBOX_MODE` variable is no longer used) | Was: home page shows the no-login demo (`public/sandbox.html`, sample data, Lead / Member switch) to anyone not signed in. `/login` and `/setup` still work. To turn off: delete the variable in Vercel and redeploy. Rebuild the demo from `design/preview.html` with `npm run sandbox:build` |

**Running it locally**
- `npm install`
- Create `.env.local` with `DATABASE_URL`, `SETUP_CODE` and `ANTHROPIC_API_KEY` (see `.env.example`)
- `npm run db:migrate` (applies new files in `db/migrations/`)
- `npm run dev`

**How sign-in works:** passwords hashed with scrypt; a random session token sits in an httpOnly cookie and only its hash is stored in the `sessions` table (30 days). After 8 wrong passwords in 15 minutes for an email, sign-in for it pauses. Invite links are random tokens; only their hash is stored, so a link is shown once. Two kinds of link: a **personal link** for someone already named (keeps their name and role; used for Irfan and Hashim), and an **open link** from the Team page (anyone who opens it types their name and email, picks a password and joins as a Member). Each link works once.

---

## Build order

Each step stops for the owner's review.

- [x] **Step 0** — `PLAN.md` (this file)
- [x] **Step 1** — Clickable design preview of the main screens (`design/preview.html`). **Approved (v2 look).**
  - Live preview: https://claude.ai/artifact/8wg1CBDtAbgQBDXva8YZnp (private to the owner)
  - Screens: Lead overview, Member overview, Cases list, Board (drag and drop), Case page, Add email (paste / upload / sample → reading → check and edit), Team, Member page, Alerts, search (Ctrl+K)
  - **v2 look (current):** frosted-glass panels over a soft, out-of-focus office background drawn in code; light mode only for now; Onest font; floating glass top bar with sliding tabs; status shown as icon + word (no outlined pills); calm wording ("past due", not "overdue")
  - **Floating tour:** spotlight walkthrough that moves around the screen (offered on first visit; replay from the help button, the `?` key, or search)
  - v1 look (rejected by owner): flat grey background, pill "bubbles", number-tile dashboard; felt "AI-made" and pressuring
  - Owner's reference for the vibe: a "glassy dashboard" reel (frosted glass over a calm scene). We build our own design in that style, not a copy
  - Signature: every Point links back to the sentence in the email it came from (hover lights it up like a highlighter)
  - Email reading in the preview is a simple stand-in; the real app uses the Claude API
- [x] **Step 2** — Login, roles, Team page. Live.
  - Live app: https://agthia-enhancements.vercel.app
  - Sign in with email + password; first visit uses `/setup` (needs the one-time setup code) to create the single Lead
  - Lead: Team page → "Create invite link" (optional note like "Sara from imports") → send it → the person opens it, types name + email, picks a password, joins as a Member (works once, 7 days). Unused links are listed and can be cancelled
  - Lead can make a new link, cancel an invite, turn a member's access off / on (turning off signs them out at once)
  - Members never see the Team page
  - Tested end to end in a browser (32 checks: setup, sign-in, wrong password, invites, one-use links, roles, access off/on, sign out, phone layout)
- [~] **Step 3** — Add email + extraction + edit. **Live, waiting for the owner's review.**
  - "Add email" (top bar; "Add" on phones) → paste text, upload .eml / .msg / .pdf / .txt (read in the browser; full threads are fine), or use a sample → Claude reads it (about 10–30 s) → check-and-edit screen (title, summary, sender, company, priority, case deadline, owner for the Lead, points with dates, "also found" details like B/L, vessel, ETA) → Create case
  - Each point keeps the exact sentence it came from; the email shows those sentences highlighted and numbered
  - If reading fails, the person can try again or fill it in by hand
  - Email text is treated as data only (the prompt tells Claude to ignore instructions inside emails)
- [~] **Step 4** — Case page, Cases list, Board, Home. **Live, waiting for the owner's review.**
  - Case page: email on the left with highlights, points on the right; status menu (To do, In progress, Waiting + reason, Done, Approved), deadline menu (today, tomorrow, Friday, next Monday, pick a date, remove), timeline, updates (Member) and remarks (Lead), add a point by hand, case deadline; phones switch between Email and Points
  - Only the Lead approves; Members mark Done and the Lead approves or reopens. Approved points are locked for Members
  - Cases list: Open / Past due / Needs review / Closed / All, owner filter for the Lead, search
  - Board: drag cards between statuses (Waiting asks for a reason); phones show one status at a time
  - Home (Lead): ready for review with Approve / Reopen, coming up (late + next 2 days), recent activity, key numbers
  - Home (Member): next steps, remarks from the Lead, open cases
  - Not yet: editing a case's title / summary after it's created, deleting a case, moving a case to another owner after it's created
- [~] **Replies, original files, Admin** (2026-11-07). **Live, waiting for the owner's review.**
  - **Add a reply** on a case (paste / upload / drop, full thread is fine). The AI compares it with the case and suggests: new points, moved deadlines, points that look done, a note per point, an updated summary. Each one can be unticked or edited. Nothing changes until "Save reply"
  - Every email on a case is kept: Original, Reply 1, Reply 2 ... each labelled with who added it and when, plus "What this reply changed". Points show "From Reply N"; timeline entries show "from Reply N"
  - **Expand** opens any email full size; **Original file** opens the uploaded PDF (or downloads .eml / .msg). Files up to 2.5 MB are kept, in the database table `email_files`; bigger files keep their text only
  - The Add email page checks open cases first: same subject or same booking / B/L / container number → "Add as a reply to AE-…" or "make a new case"
  - **Admin (view only)**: sees every case, board and team; "See their view" shows the app exactly as the Lead or a Member sees it, with a bar to go back. Admin page: database and AI health, people (last sign-in, open and late points), AI reading log (time, result, errors), sign-in log (wrong passwords, paused emails). The server refuses every change from the Admin account. Hidden from the Lead's Team page
- [~] **Excel export** (2026-11-07). **Live, waiting for the owner's review.**
  - Cases page → "Export to Excel" (`/cases/export`): filter by state (Open, Past due, Needs review, Closed, All), person (Lead / Admin), date added (this week, this month, pick dates) and search; tick cases or "Select all shown"; options: updates and remarks history (on), email text (off)
  - File `Agthia-cases-<day>-<Mon>-<year>.xlsx` with tabs: **Summary** (who exported and when, totals, table per person), **Cases** (one row per case), **Points** (one row per point, status colours, days late, which email it came from), **Change log** (every change in order; Excel doesn't allow a tab called "History"), **Emails** (if ticked)
  - Header rows frozen with filters, real Excel dates in UAE time, Case IDs link back to the app, no merged cells
  - Members can only export their own cases (checked on the server too); Lead and Admin can export any
- [~] **Several Leads, Admin invite links, shared cases, What's new** (2026-11-09). **Live, waiting for the owner's review.**
  - The team can have several Leads. Every Lead sees every case and can approve. Wording for Members says "a Lead approves" when there's more than one Lead
  - Admin can make invite links on the Team page, choosing **Member** or **Lead**, and cancel unused links. Only the Admin can invite a Lead; the Lead invites Members. Everything else stays view only for the Admin
  - **Shared cases**: a case has an owner plus people working on it (`case_members`). Any Lead, or the case owner, can add or remove people from the case page ("Add people" / "Edit"). When adding an email, anyone can pick teammates under "Working with". Everyone on a case sees it and can update its points, attach files and add replies. Lists show a "Shared" tag; Member home shows "With …"; Excel has a "Shared with" column
  - **What's new** pop-up (bottom right, above the bottom bar on phones) explaining attachments and shared cases, with role-specific lines. Shown once per account (`users.seen_news`, version in `lib/news.ts`); bump `NEWS_VERSION` for the next announcement
- [~] **Big update: dashboard, chat with AI, hand-over, phone, tour** (2026-11-11). **Live, waiting for the owner's review.**
  - **Lead dashboard** (`/dashboard`, Leads and Admin): 6 key numbers, waiting-for-approval and past-due lists (approve from there), workload by person, weekly added vs done, blocked points, per-person table, quietest cases, companies. A point counts for its assignee, else the case owner
  - **Case chat** (Chat tab on each case): messages between the people on the case (+ Leads, Admin read-only), mixed with a live feed of status changes, updates, replies and hand-overs. Polls every 4 s. "Change a status" from the chat. Unread badge on Cases and a blue dot per case (`case_reads`)
  - **Ask AI** in the chat: answers from that case only (emails, points, history, chat), visible to everyone on the case, marked AI. It can offer buttons (mark a point done, move a deadline, add a point); a person must press them. Never approves. Logged in `ai_reads` kind `chat`; 40 AI calls per person per hour
  - **Hand over / assign**: People button on a case changes the owner (note, keep old owner), adds teammates; each point on a shared case can be given to a person; Cases → Select → hand several cases to one person (Leads)
  - **Edit details** of a case (title, summary, company, priority): Lead or owner
  - **Forgot password**: Lead (for Members) or Admin (for anyone) makes a 24-hour reset link on the Team page
  - **Drop an email anywhere**: on a case → reply; elsewhere → new case. Outlook .msg read with `@kenjiuno/msgreader` (sender, recipients, date, subject, body), old rough reader as fallback
  - **Phones**: solid panels, bigger text and buttons, menus slide up from the bottom, summary collapses, 5-item bottom bar (Team and Admin moved to the user menu)
  - **Update tour + ? help**: spotlight tour per role, once per account per `NEWS_VERSION` (`lib/news.ts`, now 2), replay from the ? button; ? on every page shows a short guide for that page (`helpFor`)
  - Also: search box in the top bar (IDs, senders, BL / container numbers), approval badge on Home for Leads, loading skeleton, board drag to Done / Waiting opens the note + files step, demo moved to `/demo` (signed-out visitors get sign-in)
  - **Not done yet (said to the owner):** @mentions, keeping the files attached *inside* an email, dropping several emails at once, moving old email originals from the database to file storage, a saved automated test suite, email reminders
- [~] **Attachments on points** (2026-11-09). **Live, waiting for the owner's review.**
  - Choosing **Done** or **Waiting** opens a small step: note (optional), reason (Waiting), **Attach files**. Other statuses still change in one click; dragging on the Board still works without files
  - The update / remark box has **Attach** too (a file on its own is fine)
  - Up to 5 files at a time, 10 MB each: PDF, photos, Excel, Word, Outlook .msg / .eml, text. Programs and other risky files are refused
  - Files show in the point's history (photo previews, file chips), a 📎 count on the point, and in the Lead's review bar ("marked this done with 2 files") right above Approve
  - Excel export: Points tab has a Files count, Change log lists file names
- [ ] **Step 5** — Dashboards and analytics
- [ ] **Step 6** — Alerts (in-app + email)
- [ ] **Step 7** — Launch polish (custom domain if wanted, final checks). The app is already live on Vercel from Step 2.

---

## Open questions

- [ ] Final Point flow (waiting on the owner's email types)
- [x] Final role names (Lead / Member)
- [x] Final app name (Agthia Enhancements)
- [ ] Custom domain (optional, later)
- [x] Claude API key (given 2026-11-06, stored in Vercel only)

---

## Decisions log

| Date | Decision |
|---|---|
| 2026-11-03 | Product = email-to-tracker with Lead + Member roles |
| 2026-11-03 | One Lead for now; starts with 1 Lead + 1 Member; Lead adds Members |
| 2026-11-03 | Members see only their own Cases |
| 2026-11-03 | Email in by paste, drag-drop or file upload; no Outlook connection |
| 2026-11-03 | Member can edit everything the system extracts |
| 2026-11-03 | One email can hold several Points; each tracked on its own |
| 2026-11-03 | Both roles can set deadlines; alerts in-app and by email |
| 2026-11-03 | Generic role names (not manager / employee) |
| 2026-11-03 | Stack: Next.js + Vercel + Neon + Claude API + Resend |
| 2026-11-03 | Step 1 design preview built and published for review |
| 2026-11-03 | Owner rejected v1 look (bubbles, grey background, pressuring dashboard) |
| 2026-11-03 | v2: glass style over an office background, light mode only for now, floating tour, smooth motion |
| 2026-11-03 | v2 look approved; app named **Agthia Enhancements**; keep Lead / Member |
| 2026-11-03 | Hosting on the owner's paid Vercel; database on Neon (Frankfurt, nearest region to UAE) |
| 2026-11-03 | Step 2 built and live: login, one Lead via setup code, invite links, Team page |
| 2026-11-03 | Owner asked for a no-login sandbox for now: live link shows the demo with sample data and a Lead / Member switch. Real login stays at `/login`. Owner sets up the Lead + Claude key tomorrow |
| 2026-11-04 | Sandbox is now a demo for future users: freight sample data (bookings, customs holds, demurrage, rate quotes, rollovers, reefer alarms, delivery orders), a welcome card, a "What's being built" roadmap page (`#roadmap`), and a freight-worded tour. "Foresight" read as "show what's coming" |
| 2026-11-04 | Phone clean-up: Sandbox controls moved into one top-bar menu (no floating chip or help button), 2 summary cards on phones, lists show 3 + "Show all", notes hidden on phones, Board shows one status at a time, compact case header, shorter intro lines |
| 2026-11-04 | Sample dates follow today's date; sample case IDs use `AE-` |
| 2026-11-06 | Owner gave the Claude key and asked to make it live. Steps 3 and 4 built, tested end to end locally with the real key (77 checks), and deployed |
| 2026-11-06 | Starting accounts: **Irfan Anwar** (Lead) and **Hashim** (Member), created as named invites with personal join links (14 days). Each opens the link, adds their email, picks a password. Everyone else joins through open links the Lead makes on the Team page |
| 2026-11-06 | `/setup` no longer needed: Irfan's Lead account exists, so setup is closed |
| 2026-11-06 | Sandbox stays on for people who aren't signed in (roadmap updated to show what's live). Signed-in people get the real app |
| 2026-11-07 | Hashim uploaded a PDF of a full thread and it failed (PDF opened as text, too big to send). Fixed: PDFs are read in the browser (pdf.js), scanned PDFs and non-email files get a clear message, threads up to ~60,000 words are accepted, and the AI now reads whole threads and lists only what's still open (skips asks already done, uses moved deadlines) |
| 2026-11-07 | Owner approved a view-only **Admin** account (sees everything, "See their view" per person, sign-in and AI problem logs). Next after the PDF fix |
| 2026-11-07 | Owner asked for follow-up replies: add a new reply to an existing case so all follow-ups stay together. Plan sent for confirmation |
| 2026-11-07 | Owner approved replies + Admin, and added: keep the real email (file) viewable, make it bigger (Expand), and label every reply so the log is clear. Built, tested (49 + 11 checks), deployed |
| 2026-11-07 | Admin is view only by owner's choice: no acting as people, just seeing their view. Admin account hidden from the Lead's Team page |
| 2026-11-07 | Owner asked for a case-wise Excel export (pick cases or select all). Built with exceljs, tested (25 checks, including opening the file), deployed |
| 2026-11-09 | Owner asked for attachments when moving a status. Built with private Vercel Blob storage (Dubai), tested (24 checks), deployed. Invites stay with Irfan (owner didn't pick another option) |
| 2026-11-09 | Owner approved several Leads (all Leads see all cases), Admin invite links for Member or Lead, shared (group) cases, and a What's new pop-up. Owner said build without asking for another go. Built, tested (27 checks), deployed |
| 2026-11-11 | Session moved to a newer model. Review found: approvals not happening (16 Done, 0 approved), remarks/replies barely used, no forgot-password, rough .msg reading, hard-to-read phone screens. Owner approved the full plan plus a strong Lead dashboard and a ? help on every page, and said to build without waiting. Shipped in two releases, tested (27 + 26 checks) |
| 2026-11-11 | AI answers in chat are shared with everyone on the case (owner didn't ask for private). Chat AI uses the same model as email reading |
| 2026-11-11 | Team feedback: no dates on Home, and no pop-up when someone writes in a chat. Added: real dates on every deadline ("Sat 7 Nov · 4 days late") plus "Added 6 Nov" on Home, Cases, Board and Dashboard; a pop-up on any page for new chat messages (people on the case + Leads, not the sender, not when that chat is open), unread count in the tab title, optional desktop notification (`/api/notify`, `components/Notifier.tsx`, polls every 6 s); Chat button at the top of each case and chat shortcuts on Home and Cases rows (`?tab=chat`); the People button is now "Assign people". Email alerts for people with the app closed are still not built |
| 2026-11-13 | Team asked for an **Approvals** section, separate from cases and roles. Owner approved. Built: anyone asks (title + text and/or documents, one or more signers, optional needed-by date); signers draw a signature (finger or mouse), name + date + time stamped, optional saved signature; **Send back** (stays open, thread between requester and approvers, requester can reply or send a corrected version) or **Final reject** (closes it, new request needed); a corrected version = new version and everyone signs again (old signatures kept in the record); Signed only when all have signed; requester can remind or cancel; reference `AP-0001`; print / save as PDF record; pop-ups + red badge on the Approvals tab; requester + signers see it, Leads and Admin see all (Admin view only). Files: `db/migrations/007_approvals.sql`, `lib/approvals.ts`, `lib/approval-labels.ts`, `app/actions/approvals.ts`, `components/Approvals.tsx`, `app/(app)/approvals/*`, `app/approvals/file/[id]`. Tested (37 checks), migration 007 applied on Neon, deployed. It is an internal sign-off, not a legally certified e-signature. Not built yet (offered): signing order, linking an approval to a case, Excel export of approvals |
| 2026-11-13 | Owner asked for a general UI upgrade ("all go"). A second agent is doing a visual-only polish pass in a separate git worktree; to be reviewed, merged and deployed after Approvals |

---

## Working rules (owner's preferences)

- Keep answers simple, in bullets. Go deep only when asked or truly needed.
- Never implement or change anything without a full final confirmation.
- Keep this file updated so any chat can pick up where the last one left off.
