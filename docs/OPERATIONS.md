# Running and looking after Agthia Enhancements

Plain steps for whoever looks after the app. The project history and decisions are in `PLAN.md`.

## Run it on your own computer
1. Install Node 22 and Postgres 16.
2. Copy `.env.example` to `.env.local` and fill it in (a local database is fine; leave the file-storage token empty).
3. `npm install`
4. `npm run db:migrate` creates or updates the tables.
5. `npm run dev` and open http://localhost:3000.

## Releasing a change
- Every push to the production branch goes live on Vercel.
- The release now runs `npm run vercel-build`: it applies any new database changes in `db/migrations` first, then builds. If a database change fails, the release stops and the old version stays live.
- GitHub runs the **Check** job on every push: typecheck, build, and the access-rule tests. A red cross there means do not rely on that release until it is fixed.
- Safer habit: work on a side branch, wait for the green tick, then merge into the production branch.

## Tests
- `npm run typecheck` checks the code.
- `npm run test:access` runs the saved access-rule tests (vendors vs team, vendor vs vendor, Member vs Lead, Admin view only, signing and award safety rules). It needs a **local** database and a built, running copy; the header of `tests/access.mjs` has the exact commands. It refuses to run against anything that is not local.

## Backups
- **In the app:** Admin page, Activity, **Download a backup**. One JSON file with every record except passwords, sessions, link tokens and the attached files themselves. Do this weekly and keep the file somewhere safe (not only on one laptop).
- **Database level:** Neon keeps a short history you can restore from in the Neon console (Branches, Restore). On the free plan this window is short, so the weekly download matters. A paid Neon plan gives a longer window.
- **Attached files** live in Vercel Blob (private store). They are not in the backup file. Losing the database does not delete them, but the records that point to them would need restoring.

## Restoring
1. First choice: Neon console, restore the branch to a time before the problem.
2. If that is not possible: create a fresh database, run `npm run db:migrate`, then load the tables from the backup JSON in the order they appear in the file (people first). Everyone then sets a new password through reset links, because passwords are not in the backup.
3. Practise this once on a test database so the steps are known before they are needed.

## Settings on Vercel
- `DATABASE_URL`, `ANTHROPIC_API_KEY`, `BLOB_READ_WRITE_TOKEN`: required.
- `SETUP_CODE`: needed only for first setup and for resetting a forgotten Admin password at `/reset-admin`. Keep it long and random. Guessing is limited to a few tries per 15 minutes.
- `APP_URL`: set this to the site address so invite, join and reset links are always built from it.
- In the Anthropic console, set a monthly spend limit for the API key. The app also stops at 40 AI uses per person per hour and 400 per day for the whole team.

## Housekeeping the app does by itself
Once a day (on someone's sign-in) it removes expired sessions and links, sign-in attempts older than 30 days, and local test uploads that were never attached.

## Known limits
- Original email files are stored in the database (up to 2.5 MB each). On the free Neon plan (about 0.5 GB) this will fill up over time; moving them to the file store is still to do.
- No email or WhatsApp alerts: people and vendors only see news while the app is open.
- No two-step sign-in.
