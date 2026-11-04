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
- **Email reading:** Claude API (owner provides key by Step 3)
- **Email alerts:** Resend
- **Login:** email + password; Lead creates Member accounts

---

## Where things live

| Thing | Where | Notes |
|---|---|---|
| Code | GitHub `Saxqb777/outlook-enhancment-tracker-`, branch `claude/nice-babbage-j31aej` (also the repo's default branch) | Every push to this branch deploys to production |
| Hosting | Vercel project `agthia-enhancements` (team "saxqb777's projects") | Functions in `fra1` (Frankfurt), Node 22. Vercel login wall only on preview links |
| Database | Neon project `agthia-enhancements` (`delicate-flower-67324386`), region AWS Frankfurt, Postgres 17, database `agthia` | Free plan. Schema in `db/migrations/` |
| Secrets | Vercel environment variables `DATABASE_URL`, `SETUP_CODE` (sensitive) | Never commit these. `.env.example` lists the names |
| Sandbox mode | Vercel environment variable `SANDBOX_MODE=1` (currently **on**) | Home page shows the no-login demo (`public/sandbox.html`, sample data, Lead / Member switch) to anyone not signed in. `/login` and `/setup` still work. To turn off: delete the variable in Vercel and redeploy. Rebuild the demo from `design/preview.html` with `npm run sandbox:build` |

**Running it locally**
- `npm install`
- Create `.env.local` with `DATABASE_URL` and `SETUP_CODE` (see `.env.example`)
- `npm run db:migrate` (applies new files in `db/migrations/`)
- `npm run dev`

**How sign-in works:** passwords hashed with scrypt; a random session token sits in an httpOnly cookie and only its hash is stored in the `sessions` table (30 days). After 8 wrong passwords in 15 minutes for an email, sign-in for it pauses. Invite links are random tokens; only their hash is stored, so a link is shown once.

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
- [~] **Step 2** — Login, roles, Team page. **Built and live, waiting for the owner's review.**
  - Live app: https://agthia-enhancements.vercel.app
  - Sign in with email + password; first visit uses `/setup` (needs the one-time setup code) to create the single Lead
  - Lead: Team page → add a member → copy the invite link (works once, 7 days) → member opens it and picks a password
  - Lead can make a new link, cancel an invite, turn a member's access off / on (turning off signs them out at once)
  - Members never see the Team page; Cases and Board are placeholders until Step 3
  - Tested end to end in a browser (32 checks: setup, sign-in, wrong password, invites, one-use links, roles, access off/on, sign out, phone layout)
- [ ] **Step 3** — Add email + extraction + edit
- [ ] **Step 4** — Case page: Points, updates, remarks, deadlines
- [ ] **Step 5** — Dashboards and analytics
- [ ] **Step 6** — Alerts (in-app + email)
- [ ] **Step 7** — Launch polish (custom domain if wanted, final checks). The app is already live on Vercel from Step 2.

---

## Open questions

- [ ] Final Point flow (waiting on the owner's email types)
- [x] Final role names (Lead / Member)
- [x] Final app name (Agthia Enhancements)
- [ ] Custom domain (optional, later)
- [ ] Claude API key (needed by Step 3)

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

---

## Working rules (owner's preferences)

- Keep answers simple, in bullets. Go deep only when asked or truly needed.
- Never implement or change anything without a full final confirmation.
- Keep this file updated so any chat can pick up where the last one left off.
