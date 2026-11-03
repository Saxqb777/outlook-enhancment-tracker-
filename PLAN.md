# Docket — Plan

> Living plan and cross-chat memory. Read this first in any new chat.
> Rule: nothing gets built or changed without the owner's final OK.
> "Docket" is a working name only.

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
- Role names are not final. Other options: Owner/Member, Admin/Contributor, Reviewer/Assignee.

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
- Clean, sharp work tool. One distinctive typeface, clear status colours, light and dark mode.
- Fast to use: drag-drop upload, board / list toggle, keyboard shortcuts, Ctrl+K search, smooth motion.

---

## Stack

- **App:** Next.js (TypeScript) on Vercel
- **Data:** Neon Postgres
- **Email reading:** Claude API (owner provides key by Step 3)
- **Email alerts:** Resend
- **Login:** email + password; Lead creates Member accounts

---

## Build order

Each step stops for the owner's review.

- [x] **Step 0** — `PLAN.md` (this file)
- [~] **Step 1** — Clickable design preview of the main screens (`design/preview.html`). **Built, waiting for the owner's review.**
  - Live preview: https://claude.ai/artifact/8wg1CBDtAbgQBDXva8YZnp (private to the owner)
  - Screens: Lead overview, Member overview, Cases list, Board (drag and drop), Case page, Add email (paste / upload / sample → reading → check and edit), Team, Member page, Alerts, search (Ctrl+K)
  - Look: Archivo (wide for headings) + IBM Plex Mono for IDs, dates and email headers; cool grey paper, ink buttons, highlighter yellow as the one accent
  - Signature: every Point links back to the sentence in the email it came from (hover lights it up like a highlighter)
  - Email reading in the preview is a simple stand-in; the real app uses the Claude API
- [ ] **Step 2** — Login, roles, Team page
- [ ] **Step 3** — Add email + extraction + edit
- [ ] **Step 4** — Case page: Points, updates, remarks, deadlines
- [ ] **Step 5** — Dashboards and analytics
- [ ] **Step 6** — Alerts (in-app + email)
- [ ] **Step 7** — Go live on Vercel

---

## Open questions

- [ ] Final Point flow (waiting on the owner's email types)
- [ ] Final role names
- [ ] Final app name (working: Docket)
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

---

## Working rules (owner's preferences)

- Keep answers simple, in bullets. Go deep only when asked or truly needed.
- Never implement or change anything without a full final confirmation.
- Keep this file updated so any chat can pick up where the last one left off.
