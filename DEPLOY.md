# Clarke Mechanical — Deploy Commands

Copy/paste these. **Never** run `npm run build` without the two `VITE_` lines —
a build missing them produces a website that loads but cannot reach the backend
(blank dashboard, login fails with a correct password).

---

## 1. Website (and the iPhone app's web layer)

```bash
cd "/Users/apple/Desktop/Clarke Mechanical/client" && \
VITE_API_URL=https://clarke-mechanical-inc.onrender.com/api \
VITE_GOOGLE_MAPS_API_KEY=AIzaSyC2ahZmRv0GLvYJ8WkZ0FRd5KvGih6Ie0c \
npm run build && cd .. && firebase deploy --only hosting
```

Look for `✓ built in …` then `Deploy complete!`. If either is missing, it did not ship.

Then hard-refresh the site: **Cmd + Shift + R**.

---

## 2. Backend (API on Render)

Render redeploys automatically when you push to GitHub.

```bash
cd "/Users/apple/Desktop/Clarke Mechanical" && \
git add -A && git commit -m "describe the change" && git push
```

Confirm in Render → Logs that the new deploy started, and that it prints:
`[db] Using Postgres (DATABASE_URL set)`

---

## 3. iPhone app (only when app code changes)

```bash
cd "/Users/apple/Desktop/Clarke Mechanical/client" && \
VITE_API_URL=https://clarke-mechanical-inc.onrender.com/api \
VITE_GOOGLE_MAPS_API_KEY=AIzaSyC2ahZmRv0GLvYJ8WkZ0FRd5KvGih6Ie0c \
npm run build && npx cap sync ios && npx cap open ios
```

Then in Xcode: bump the build number → Product → Archive → Distribute.

---

## Which do I need?

| Changed | Run |
|---|---|
| Anything in `client/` (screens, buttons, layout) | **1** |
| Anything in `functions/` (API, database, email) | **2** |
| Both | **2 then 1** |
| Shipping a new App Store version | **1 then 3** |

---

## If something breaks after a deploy

1. **Hard-refresh** (Cmd + Shift + R), or test in a **Private window** to rule out caching.
2. Check the browser **Console** (Cmd + Option + C) for red errors.
3. Check **Render → Logs** (set range to Last hour, search `Error`).
4. Sanity-check the build actually contains the backend URL:
   ```bash
   grep -c "onrender.com/api" "/Users/apple/Desktop/Clarke Mechanical/client/dist/assets/"index-*.js
   ```
   `0` means it was built without the `VITE_` lines — rebuild using command **1**.

---

## Banking (Plaid) setup

The **Banking** page (admin/office) connects the business bank account via Plaid to
show balance + transactions, and — once approved — pay vendors by ACH.

**Step 1 — make a Plaid account:** sign up at https://dashboard.plaid.com/signup.
From the dashboard, open **Developers → Keys** and copy the `client_id` and the
**Sandbox** secret first (free, fake data — good for testing the whole flow).

**Step 2 — add these env vars in Render** (API service → Environment), then deploy:

```
PLAID_CLIENT_ID = <your client_id>
PLAID_SECRET    = <sandbox secret to start; production secret when live>
PLAID_ENV       = sandbox        # change to "production" when going live
PLAID_TOKEN_KEY = <any 32+ character random string — keep it secret, never change it>
PLAID_TRANSFER  = off            # set to "on" ONLY after Plaid approves Transfer
```

`PLAID_TOKEN_KEY` encrypts the stored bank access token. Pick one long random
string and leave it — changing it later makes the saved bank link unreadable
(just reconnect the bank if that happens).

**Step 3 — test in sandbox:** open Banking → Connect bank account → choose any
sample bank → use Plaid's sandbox login `user_good` / `pass_good`. You'll see fake
balances and transactions. No real account is touched.

**Step 4 — go live (balance/transactions):** in Plaid, request **Production**
access, get the production secret, set `PLAID_SECRET` to it and `PLAID_ENV=production`
in Render, redeploy, then reconnect the real Bank of America account.

**Step 5 — go live (paying vendors):** this needs Plaid's **Transfer** product,
which Plaid approves separately (application + review). Only after that approval,
set `PLAID_TRANSFER=on`. Until then the "Pay a vendor" button stays hidden and the
payment endpoint refuses — by design, so no money can move before you're ready.

The Plaid keys are backend-only (Render). They are **never** in the website build,
so section 1's `VITE_` lines don't change.

---

## Environment reference

- Website: https://clarkemechanicalinc.org (Firebase Hosting, site `clarke-mechanical-inc`)
- API: https://clarke-mechanical-inc.onrender.com/api (Render)
- Database: Render Postgres `clarke-db` — the API needs `DATABASE_URL` set to the
  **Internal** Database URL. Removing that variable rolls back to Firestore.
- Never commit: service-account `.json` keys, database URLs, or the temporary
  `_chk.js` / `_reset-my-password.js` diagnostic scripts.
