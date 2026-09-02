# Move Clarke Mechanical off Firestore → Render Postgres

This removes Firebase's database (and its daily read limit) for good. Your app keeps
working exactly the same — customers won't notice anything. **No data is lost:** a
migration script copies every record from Firestore into Postgres before you switch.

The code is already done. You just do 4 things: create the database, install the new
package, run the migration, flip one setting. ~20–30 minutes.

---

## Before you start
- Do this **after** the Firestore quota has reset (the site loads normally again), because
  the migration has to *read* all your data out of Firestore one time.
- Have your existing `FIREBASE_SERVICE_ACCOUNT` value handy (it's already an env var on your
  Render backend — Render dashboard → your API service → **Environment**).

---

## Step 1 — Create the Postgres database on Render
1. Render dashboard → **New +** → **PostgreSQL**.
2. Name it `clarke-db`, pick the same region as your API service, choose a plan
   (the **$7/mo Starter** is fine; the Free plan works but expires after 90 days).
3. Click **Create Database** and wait until status is **Available**.
4. On the database page, copy two things from the **Connections** section:
   - **Internal Database URL** — the app will use this.
   - **External Database URL** — you'll use this to run the migration from your Mac.

---

## Step 2 — Install the new package
On your Mac:

```bash
cd "/Users/apple/Desktop/Clarke Mechanical/functions"
npm install
```

(That picks up `pg`, the Postgres driver I added to package.json.)

---

## Step 3 — Run the migration (copies all your data)
Paste your real values in place of the two `...` below and run it from your Mac.
`FIREBASE_SERVICE_ACCOUNT` must be the **full JSON** in single quotes; `DATABASE_URL` is the
**External** URL from Step 1.

```bash
cd "/Users/apple/Desktop/Clarke Mechanical/functions"
FIREBASE_SERVICE_ACCOUNT='...paste the service-account JSON...' \
DATABASE_URL='...paste the EXTERNAL database URL...' \
node scripts/migrate-firestore-to-postgres.js
```

You'll see it list each collection with a document count, ending in
`✓ Done. Copied N documents.` Nothing in Firestore is changed or deleted — it's read-only on
that side, so you can re-run it safely if anything looks off.

---

## Step 4 — Point the app at Postgres
1. Render dashboard → your **API service** → **Environment** → **Add Environment Variable**.
2. Key: `DATABASE_URL`  Value: the **Internal Database URL** from Step 1.
3. Save. Render redeploys automatically.

That's it. On boot the API logs `[db] Using Postgres (DATABASE_URL set)` and every screen now
reads and writes to Postgres. Firestore is no longer touched — no more quota errors.

---

## How to verify
- Log in as admin and open Invoices, Customers, Jobs — your existing records should all be there.
- Create a test invoice, then delete it — confirms writes work.
- Render logs show the Postgres line above and no Firestore errors.

## Rolling back (if ever needed)
Just **remove** the `DATABASE_URL` env var and redeploy — the app instantly goes back to
Firestore, untouched. That's your safety net; keep Firebase around until you're confident.

## Notes
- You can leave `FIREBASE_SERVICE_ACCOUNT` set — it's ignored once `DATABASE_URL` exists, and
  keeps rollback available.
- Once you're happy after a week or two, you can downgrade/close the Firebase project.
- Cost: one Render Postgres (~$7/mo). No per-read charges ever — the thing that kept breaking.
